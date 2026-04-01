/**
 * Genius Protocol — Volume Adapter
 *
 * Fetches daily trading volume per chain from the Genius Protocol stats API.
 * API: https://gp-timeseries-api-tempo.up.railway.app/stats/daily-volume?date=YYYY-MM-DD
 */

import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const DAILY_VOLUME_URL =
  "https://gp-timeseries-api-tempo.up.railway.app/stats/daily-volume";

// Maps EVM chain IDs (and Solana's custom ID) to dimension-adapters chain names
const CHAIN_ID_MAP: Record<string, string> = {
  "1": CHAIN.ETHEREUM,
  "10": CHAIN.OPTIMISM,
  "56": CHAIN.BSC,
  "137": CHAIN.POLYGON,
  "146": CHAIN.SONIC,
  "999": CHAIN.HYPERLIQUID,
  "8453": CHAIN.BASE,
  "42161": CHAIN.ARBITRUM,
  "43114": CHAIN.AVAX,
  "1399811149": CHAIN.SOLANA,  // 0x536F6C61 = "SoLa" in ASCII
};

// Reverse map: chain name → chain ID for lookup inside fetch
const CHAIN_NAME_TO_ID = Object.fromEntries(
  Object.entries(CHAIN_ID_MAP).map(([id, name]) => [name, id])
);

const prefetch = async (options: FetchOptions) => {
  return await fetchURL(`${DAILY_VOLUME_URL}?date=${options.dateString}`);
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = options.preFetchedResults;

  const chainId = CHAIN_NAME_TO_ID[options.chain];
  const chainData = data?.chains?.[chainId];
  if (!chainData) return { dailyVolume: 0 };

  return { dailyVolume: chainData.total_usd_value };
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  fetch,
  chains: Object.values(CHAIN_ID_MAP),
  start: '2026-01-01',
  methodology: {
    Volume: "Daily trading volume per chain from the Genius Protocol stats API.",
  },
};

export default adapter;
