import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

/**
 * Vurto Swap is a non-custodial meta-aggregator. It quotes the same trade
 * across several liquidity providers at once and ranks the routes by the amount
 * that actually reaches the user's wallet, after gas and every fee.
 *
 * Volume comes from Vurto's own public API rather than from on-chain events,
 * which the aggregator guidelines allow when on-chain tracking is impractical.
 * It is impractical here: only the many-to-many basket mode routes through the
 * VurtoSwapRouter contract, while single swaps and the two Double modes are
 * signed straight against the winning provider's own router, so there is no
 * single contract that observes every trade.
 */
const API = "https://swap.vurto.cc/api/stats/daily-volume";

// The day per-swap USD volume started being recorded. Earlier days are not
// zero-volume days, they are days without a record, so the adapter refuses them
// instead of claiming a zero that would be indistinguishable from no trading.
const START = "2026-08-11";

const CHAIN_IDS: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BSC]: 56,
  [CHAIN.XDAI]: 100,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.POLYGON]: 137,
  [CHAIN.BASE]: 8453,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const chainId = CHAIN_IDS[options.chain];
  const res = await httpGet(`${API}?chainId=${chainId}&timestamp=${options.startOfDay}`);
  // The endpoint answers 0 on a day without a confirmed swap and never errors,
  // so a quiet day does not break the series.
  return { dailyVolume: res?.dailyVolume ?? 0 };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: Object.fromEntries(
    Object.keys(CHAIN_IDS).map((chain) => [chain, { fetch, start: START }]),
  ),
};

export default adapter;
