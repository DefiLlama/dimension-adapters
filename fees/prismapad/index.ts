import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Prismapad launchpad on Stable (chain id 988).
// v1 (bonding curve, legacy — still live for its tokens):
// https://stablescan.xyz/address/0xdcb881fc8b472eb7797687b237e6cb123c425ff7#code
// v2 (direct-to-DEX): every token launches straight into an official
// StableSwap (Uniswap v3) pool with the full supply as locked liquidity;
// the 1% pool fee is collected by the launchpad and split 50/50 between the
// token's creator and the protocol treasury (CREATOR_SHARE_BPS = 5000):
// https://stablescan.xyz/address/0xa96d9eadc4d6eed50fa408a33585c5f1df039db5#code
const LAUNCHPAD_V1 = "0xdcb881fc8b472eb7797687b237e6cb123c425ff7";
const LAUNCHPAD_V2 = "0xa96d9eadc4d6eed50fa408a33585c5f1df039db5";
const V2_DEPLOY_BLOCK = 32896230;

// USDT0 ERC-20 (6 decimals) — on Stable this is the same asset as the native
// gas balance; v2 pools quote against it.
const USDT0 = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";

const BPS = 10_000n;
const CREATOR_SHARE_BPS = 5_000n;
// v2 pools are created at the Uniswap v3 1% fee tier (100 bps).
const POOL_FEE_BPS = 100n;

const TRADE =
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 usdtAmount, uint256 tokenAmount, uint256 fee, uint256 reserveUsdt, uint256 reserveToken)";
const TOKEN_CREATED_V2 =
  "event TokenCreated(address indexed token, address indexed creator, address pool, uint256 positionId, string name, string symbol, string metadataURI)";
const SWAP =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // ---- v1: bonding-curve trades on the legacy launchpad (native USDT0)
  const tradeLogs = await options.getLogs({ target: LAUNCHPAD_V1, eventAbi: TRADE });
  for (const log of tradeLogs) {
    const fee = BigInt(log.fee);
    const creatorShare = (fee * CREATOR_SHARE_BPS) / BPS;
    const protocolShare = fee - creatorShare;
    dailyVolume.addGasToken(log.usdtAmount);
    dailyFees.addGasToken(fee, METRIC.SWAP_FEES);
    dailyRevenue.addGasToken(protocolShare, "Trade fees to protocol");
    dailySupplySideRevenue.addGasToken(creatorShare, "Trade fees to token creators");
  }

  // ---- v2: Uniswap v3 swaps on pools created by the v2 launchpad
  const launches = await options.getLogs({
    target: LAUNCHPAD_V2,
    eventAbi: TOKEN_CREATED_V2,
    fromBlock: V2_DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  // token/USDT0 ordering differs per pool: USDT0 is token0 iff it sorts
  // below the launched token's address
  const usdt0IsToken0 = new Map<string, boolean>();
  const pools: string[] = [];
  for (const log of launches) {
    pools.push(log.pool);
    usdt0IsToken0.set(
      String(log.pool).toLowerCase(),
      USDT0.toLowerCase() < String(log.token).toLowerCase(),
    );
  }

  if (pools.length) {
    const swapLogs = await options.getLogs({
      targets: pools,
      eventAbi: SWAP,
      flatten: false,
    });
    swapLogs.forEach((logs: any[], i: number) => {
      const isToken0 = usdt0IsToken0.get(pools[i].toLowerCase());
      for (const log of logs) {
        const raw = isToken0 ? BigInt(log.amount0) : BigInt(log.amount1);
        const usdtLeg = raw < 0n ? -raw : raw; // 6-dec USDT0 units
        const swapFee = (usdtLeg * POOL_FEE_BPS) / BPS;
        const creatorShare = (swapFee * CREATOR_SHARE_BPS) / BPS;
        const protocolShare = swapFee - creatorShare;
        dailyVolume.add(USDT0, usdtLeg);
        dailyFees.add(USDT0, swapFee, METRIC.SWAP_FEES);
        dailyRevenue.add(USDT0, protocolShare, "Trade fees to protocol");
        dailySupplySideRevenue.add(USDT0, creatorShare, "Trade fees to token creators");
      }
    });
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "A flat 1% fee on every trade, in USDT0: charged by the bonding curve on legacy v1 tokens, and by the 1% Uniswap v3 pool tier on v2 tokens (measured on the USDT0 leg of each swap).",
  UserFees: "Traders pay the 1% trade fee; there is no token-creation fee.",
  Revenue: "50% of every trade fee accrues to the Prismapad treasury.",
  ProtocolRevenue: "50% of every trade fee accrues to the Prismapad treasury.",
  SupplySideRevenue:
    "50% of every trade fee accrues to the launched token's creator (v1: claimable from the launchpad; v2: collected from the locked pool position).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "1% fee on every trade: bonding-curve trades (v1) and swaps in launchpad-created StableSwap pools (v2).",
  },
  Revenue: {
    "Trade fees to protocol": "The protocol's 50% share of the 1% trade fee.",
  },
  ProtocolRevenue: {
    "Trade fees to protocol": "The protocol's 50% share of the 1% trade fee.",
  },
  SupplySideRevenue: {
    "Trade fees to token creators": "The token creator's 50% share of the 1% trade fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.STABLE],
  start: "2026-07-23",
  fetch,
  methodology,
  breakdownMethodology,
  doublecounted: true, // v2 swap fees are also attributed to stableswap-xyz-v3
};

export default adapter;
