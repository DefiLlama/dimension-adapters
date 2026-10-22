import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";

// LCX Liberty DEX: a non-custodial DEX aggregator by LCX Liberty Labs Inc. (LCX USA).
// Two router proxies, each at one address on every chain it serves: the first on Ethereum, Base,
// Arbitrum and OP Mainnet, the second on Robinhood Chain, BNB Chain, Polygon and Avalanche
// (live 12 Oct 2026) and Unichain, Monad, HyperEVM and Arc (live 19 Oct 2026). Both emit the
// same `Swapped` event once per settled swap.
// No fee is taken on the swap, so no fees or revenue are reported.
const ROUTER_1 = "0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0";
const ROUTER_2 = "0x0000000000654902B6Ed6cC240cc81CB4c4a3dff";
const NEW_CHAINS_START = "2026-10-12";
const THIRD_CHAINS_START = "2026-10-19";

// `wrapped` prices the native gas token. Arc has none: its gas coin is USDC itself, whose native
// balance has 18 decimals while the USDC token (0x3600...) has 6, and LCX Liberty DEX only routes
// it as the token there. A native row on Arc is skipped rather than priced.
const chainConfig: Record<string, { router: string; wrapped?: string; start: string }> = {
  [CHAIN.ETHEREUM]: { router: ROUTER_1, wrapped: ADDRESSES.ethereum.WETH, start: "2026-09-10" },
  [CHAIN.BASE]: { router: ROUTER_1, wrapped: ADDRESSES.optimism.WETH_1, start: "2026-09-10" },
  [CHAIN.ARBITRUM]: { router: ROUTER_1, wrapped: ADDRESSES.arbitrum.WETH, start: "2026-09-10" },
  [CHAIN.OPTIMISM]: { router: ROUTER_1, wrapped: ADDRESSES.optimism.WETH_1, start: "2026-09-10" },
  [CHAIN.ROBINHOOD]: { router: ROUTER_2, wrapped: ADDRESSES.robinhood.WETH, start: NEW_CHAINS_START },
  [CHAIN.BSC]: { router: ROUTER_2, wrapped: ADDRESSES.bsc.WBNB, start: NEW_CHAINS_START },
  [CHAIN.POLYGON]: { router: ROUTER_2, wrapped: ADDRESSES.polygon.WMATIC_2, start: NEW_CHAINS_START },
  [CHAIN.AVAX]: { router: ROUTER_2, wrapped: ADDRESSES.avax.WAVAX, start: NEW_CHAINS_START },
  [CHAIN.UNICHAIN]: { router: ROUTER_2, wrapped: ADDRESSES.unichain.WETH, start: THIRD_CHAINS_START },
  [CHAIN.MONAD]: { router: ROUTER_2, wrapped: ADDRESSES.monad.WMON, start: THIRD_CHAINS_START },
  [CHAIN.HYPERLIQUID]: { router: ROUTER_2, wrapped: ADDRESSES.hyperliquid.WHYPE, start: THIRD_CHAINS_START },
  [CHAIN.ARC]: { router: ROUTER_2, start: THIRD_CHAINS_START },
};
const EVENT_SWAPPED = "event Swapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)";

// The chain's native gas token is reported as the zero address; price it as the chain's wrapped native token.
const NATIVE = ADDRESSES.null;

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const { router, wrapped } = chainConfig[chain];
  const blacklisted = getDefaultDexTokensBlacklisted(chain);
  const isBlacklisted = (token: string) => blacklisted.includes(formatAddress(token));
  const priced = (token: string) => (formatAddress(token) === NATIVE ? wrapped : token);

  const dailyVolume = createBalances();
  const logs = await getLogs({ targets: [router], eventAbi: EVENT_SWAPPED });
  logs
    .filter((log: any) => !isBlacklisted(log.tokenIn) && !isBlacklisted(log.tokenOut) && priced(log.tokenOut))
    .forEach((log: any) => dailyVolume.add(priced(log.tokenOut)!, log.amountOut));

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Sum of the output amount of every Swapped event emitted by the LCX Liberty routers: 0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0 on Ethereum, Base, Arbitrum and OP Mainnet, and 0x0000000000654902B6Ed6cC240cc81CB4c4a3dff on Robinhood Chain, BNB Chain, Polygon, Avalanche, Unichain, Monad, HyperEVM and Arc. The native gas token is priced as the chain's wrapped native token (on Arc, where the gas coin is USDC itself, swaps are counted in the USDC token). No fee is charged on swaps, so no fees or revenue are reported.",
  },
};

export default adapter;
