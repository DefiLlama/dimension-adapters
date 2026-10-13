import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getConfig } from "../helpers/cache";
import { httpGet } from "../utils/fetchURL";

// Hyperlane warp routes. Every route deploys one router per chain; a transfer emits SentTransferRemote on the
// origin chain's router (outgoing) and ReceivedTransferRemote on the destination chain's router (incoming).
// Routers come from the Hyperlane registry (https://github.com/hyperlane-xyz/hyperlane-registry,
// deployments/warp_routes), read from the npm build of the registry, which bundles every route in one file.
const REGISTRY = "https://cdn.jsdelivr.net/npm/@hyperlane-xyz/registry@latest/dist/warpRouteConfigs.js";
const SENT = "event SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amount)";
const RECEIVED = "event ReceivedTransferRemote(uint32 indexed origin, bytes32 indexed recipient, uint256 amount)";
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

// Hyperlane registry chain name -> DefiLlama chain. EVM chains with warp route volume (September 2026).
// Not covered: Paradex/Starknet, Solana, Cosmos and other non-EVM routers; krown, subtensor, carrchain and
// electroneum (no chain key or RPC here).
const chainMap: Record<string, string> = {
  ethereum: CHAIN.ETHEREUM,
  arbitrum: CHAIN.ARBITRUM,
  base: CHAIN.BASE,
  bsc: CHAIN.BSC,
  optimism: CHAIN.OPTIMISM,
  polygon: CHAIN.POLYGON,
  mode: CHAIN.MODE,
  coti: CHAIN.COTI,
  katana: CHAIN.KATANA,
  linea: CHAIN.LINEA,
  citrea: CHAIN.CITREA,
  monad: CHAIN.MONAD,
  pulsechain: CHAIN.PULSECHAIN,
  ink: CHAIN.INK,
  hyperevm: CHAIN.HYPERLIQUID,
  lukso: CHAIN.LUKSO,
  avalanche: CHAIN.AVAX,
  worldchain: CHAIN.WC,
  unichain: CHAIN.UNICHAIN,
};

// ENI's RPCs silently return no logs for ranges of a few thousand blocks (5000 returned 0 where 1000 returned all)
const MAX_BLOCK_RANGE: Record<string, number> = {
  [CHAIN.ENI]: 1000,
};

// M0 portals are M0's own bridge contracts, not token routers; atomic local rebalancing bridges move LP
// liquidity between collateral routers, not user transfers
const SKIP_STANDARDS = new Set(["EvmM0Portal", "EvmAtomicLocalRebalancingBridge"]);
const NATIVE_STANDARDS = new Set(["EvmHypNative"]);
const SYNTHETIC_STANDARDS = new Set(["EvmHypSynthetic", "EvmHypSyntheticRebase"]);

type WarpToken = {
  addressOrDenom: string;
  chainName: string;
  standard: string;
  symbol: string;
  collateralAddressOrDenom?: string;
  scale?: number | { numerator: number; denominator: number };
};

type Router = { address: string; token: string; numerator: bigint; denominator: bigint };

async function getWarpRoutes(): Promise<Record<string, { tokens: WarpToken[] }>> {
  return getConfig("hyperlane-warp-routes", undefined, {
    fetcher: async () => {
      // the file is `export const warpRouteConfigs = {...};`, the object itself is plain JSON
      const src: string = await httpGet(REGISTRY, { responseType: "text" });
      return JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
    },
  });
}

// event amounts are in the route's message units; local amount = amount * denominator / numerator
function getScale(t: WarpToken) {
  if (t.scale === undefined) return { numerator: 1n, denominator: 1n };
  if (typeof t.scale === "number") return { numerator: BigInt(t.scale), denominator: 1n };
  return { numerator: BigInt(t.scale.numerator), denominator: BigInt(t.scale.denominator) };
}

// the token a router's transfers are priced in, as a chain-prefixed key: the collateral it locks, or the gas token
function getPriceKey(t: WarpToken): string | undefined {
  const chain = chainMap[t.chainName];
  if (!chain) return;
  if (t.collateralAddressOrDenom) return `${chain}:${t.collateralAddressOrDenom.toLowerCase()}`;
  if (NATIVE_STANDARDS.has(t.standard)) return `${chain}:${NULL_ADDRESS}`;
}

async function getRouters(chain: string): Promise<Router[]> {
  const routes = await getWarpRoutes();
  // keyed by address: a router can be listed in several routes (e.g. MoonPay's CROSS/moonpay and USDC/moonpay)
  const routers = new Map<string, Router>();
  for (const { tokens } of Object.values(routes)) {
    for (const t of tokens) {
      if (chainMap[t.chainName] !== chain || !t.standard.startsWith("Evm") || SKIP_STANDARDS.has(t.standard)) continue;
      if (routers.has(t.addressOrDenom.toLowerCase())) continue;
      let token = getPriceKey(t);
      let scale = getScale(t);
      if (!token && SYNTHETIC_STANDARDS.has(t.standard)) {
        // synthetics are minted by the route and often unpriced on small chains; price them in the same
        // asset locked by the route's collateral router, converted into that router's units
        const anchor = tokens.find((a) => a.symbol === t.symbol && !SKIP_STANDARDS.has(a.standard) && getPriceKey(a));
        if (anchor) {
          token = getPriceKey(anchor);
          scale = getScale(anchor);
        } else {
          token = `${chain}:${t.addressOrDenom.toLowerCase()}`;
        }
      }
      if (!token) continue; // collateral router without a collateral token in the registry
      routers.set(t.addressOrDenom.toLowerCase(), { address: t.addressOrDenom, token, ...scale });
    }
  }
  return [...routers.values()];
}

// logs grouped per target. The range is split here rather than with getLogs' maxBlockRange, which returns
// chunk-major arrays when flatten is false
async function getRouterLogs(options: FetchOptions, targets: string[], eventAbi: string): Promise<any[][]> {
  const maxBlockRange = MAX_BLOCK_RANGE[options.chain];
  if (!maxBlockRange) return options.getLogs({ targets, eventAbi, flatten: false });
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const perTarget: any[][] = targets.map(() => []);
  for (let start = fromBlock; start <= toBlock; start += maxBlockRange) {
    const chunk = await options.getLogs({ targets, eventAbi, flatten: false, fromBlock: start, toBlock: Math.min(start + maxBlockRange - 1, toBlock) });
    chunk.forEach((logs: any[], i: number) => perTarget[i].push(...logs));
  }
  return perTarget;
}

const fetch = async (options: FetchOptions) => {
  const routers = await getRouters(options.chain);
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  const targets = routers.map((r) => r.address);
  const sent = await getRouterLogs(options, targets, SENT);
  const received = await getRouterLogs(options, targets, RECEIVED);

  routers.forEach((router, i) => {
    for (const log of sent[i]) {
      dailyOutgoingVolume.addTokenVannila(router.token, BigInt(log.amount) * router.denominator / router.numerator);
      dailyOutgoingTxCount++;
    }
    for (const log of received[i]) {
      dailyIncomingVolume.addTokenVannila(router.token, BigInt(log.amount) * router.denominator / router.numerator);
      dailyIncomingTxCount++;
    }
  });

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: Object.values(chainMap),
  methodology: {
    OutgoingVolume: "Value of tokens sent through Hyperlane warp routes from each chain. Transfers leaving non-EVM chains such as Paradex, Starknet and Solana are not counted.",
    IncomingVolume: "Value of tokens delivered by Hyperlane warp routes on each chain. Transfers arriving on non-EVM chains such as Paradex, Starknet and Solana are not counted.",
    OutgoingTxCount: "Number of warp route transfers sent from each chain.",
    IncomingTxCount: "Number of warp route transfers delivered on each chain.",
  },
};

export default adapter;
