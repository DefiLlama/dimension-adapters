import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";

// LCX Liberty DEX: a non-custodial DEX aggregator by LCX Liberty Labs Inc. (LCX USA).
// One router proxy at the same address on every chain; it emits `Swapped` once per settled swap.
// No fee is taken on the swap, so no fees or revenue are reported.
const ROUTER = "0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0";
const EVENT_SWAPPED = "event Swapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)";

// Native ETH is reported as the zero address; price it as the chain's wrapped ETH.
const NATIVE = "0x0000000000000000000000000000000000000000";
const WRAPPED: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  [CHAIN.BASE]: "0x4200000000000000000000000000000000000006",
  [CHAIN.ARBITRUM]: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  [CHAIN.OPTIMISM]: "0x4200000000000000000000000000000000000006",
};

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const blacklisted = getDefaultDexTokensBlacklisted(chain);
  const isBlacklisted = (token: string) => blacklisted.includes(formatAddress(token));
  const priced = (token: string) => (formatAddress(token) === NATIVE ? WRAPPED[chain] : token);

  const dailyVolume = createBalances();
  const logs = await getLogs({ targets: [ROUTER], eventAbi: EVENT_SWAPPED });
  logs
    .filter((log: any) => !isBlacklisted(log.tokenIn) && !isBlacklisted(log.tokenOut))
    .forEach((log: any) => dailyVolume.add(priced(log.tokenOut), log.amountOut));

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-09-10",
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.OPTIMISM],
  methodology: {
    Volume: "Sum of the output amount of every Swapped event emitted by the LCX Liberty router (0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0) on each chain; native ETH is priced as the chain's wrapped ETH. No fee is charged on swaps, so no fees or revenue are reported.",
  },
};

export default adapter;
