import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";

// LCX Liberty DEX: a non-custodial DEX aggregator by LCX Liberty Labs Inc. (LCX USA).
// Two router proxies, each at one address on every chain it serves: the first on Ethereum, Base,
// Arbitrum and OP Mainnet, the second on Robinhood Chain, BNB Chain, Polygon and Avalanche
// (live 12 Oct 2026). Both emit the same `Swapped` event once per settled swap.
// No fee is taken on the swap, so no fees or revenue are reported.
const ROUTER_1 = "0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0";
const ROUTER_2 = "0x0000000000654902B6Ed6cC240cc81CB4c4a3dff";
const ROUTER: Record<string, string> = {
  [CHAIN.ETHEREUM]: ROUTER_1,
  [CHAIN.BASE]: ROUTER_1,
  [CHAIN.ARBITRUM]: ROUTER_1,
  [CHAIN.OPTIMISM]: ROUTER_1,
  [CHAIN.ROBINHOOD]: ROUTER_2,
  [CHAIN.BSC]: ROUTER_2,
  [CHAIN.POLYGON]: ROUTER_2,
  [CHAIN.AVAX]: ROUTER_2,
};
const EVENT_SWAPPED = "event Swapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)";

// The chain's native gas token is reported as the zero address; price it as the chain's wrapped native token.
const NATIVE = ADDRESSES.null;
const WRAPPED: Record<string, string> = {
  [CHAIN.ETHEREUM]: ADDRESSES.ethereum.WETH,
  [CHAIN.BASE]: ADDRESSES.optimism.WETH_1,
  [CHAIN.ARBITRUM]: ADDRESSES.arbitrum.WETH,
  [CHAIN.OPTIMISM]: ADDRESSES.optimism.WETH_1,
  [CHAIN.ROBINHOOD]: ADDRESSES.robinhood.WETH,
  [CHAIN.BSC]: ADDRESSES.bsc.WBNB,
  [CHAIN.POLYGON]: ADDRESSES.polygon.WMATIC_2,
  [CHAIN.AVAX]: ADDRESSES.avax.WAVAX,
};

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const blacklisted = getDefaultDexTokensBlacklisted(chain);
  const isBlacklisted = (token: string) => blacklisted.includes(formatAddress(token));
  const priced = (token: string) => (formatAddress(token) === NATIVE ? WRAPPED[chain] : token);

  const dailyVolume = createBalances();
  const logs = await getLogs({ targets: [ROUTER[chain]], eventAbi: EVENT_SWAPPED });
  logs
    .filter((log: any) => !isBlacklisted(log.tokenIn) && !isBlacklisted(log.tokenOut))
    .forEach((log: any) => dailyVolume.add(priced(log.tokenOut), log.amountOut));

  return { dailyVolume };
}

const NEW_CHAINS_START = "2026-10-12";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-09-10",
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.BASE,
    CHAIN.ARBITRUM,
    CHAIN.OPTIMISM,
    [CHAIN.ROBINHOOD, { start: NEW_CHAINS_START }],
    [CHAIN.BSC, { start: NEW_CHAINS_START }],
    [CHAIN.POLYGON, { start: NEW_CHAINS_START }],
    [CHAIN.AVAX, { start: NEW_CHAINS_START }],
  ],
  methodology: {
    Volume: "Sum of the output amount of every Swapped event emitted by the LCX Liberty routers: 0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0 on Ethereum, Base, Arbitrum and OP Mainnet, and 0x0000000000654902B6Ed6cC240cc81CB4c4a3dff on Robinhood Chain, BNB Chain, Polygon and Avalanche. The native gas token is priced as the chain's wrapped native token. No fee is charged on swaps, so no fees or revenue are reported.",
  },
};

export default adapter;
