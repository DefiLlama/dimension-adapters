/**
 * Genius Protocol — Volume Adapter
 *
 * Fetches daily trading volume per chain from the Genius Protocol stats API.
 * API: https://gp-timeseries-api-tempo.up.railway.app/stats/daily-volume?date=YYYY-MM-DD
 */

import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const DAILY_VOLUME_URL =
  "https://gp-timeseries-api-tempo.up.railway.app/stats/daily-volume";

const START_DATE = "2026-01-01";

// Maps EVM chain IDs (and Solana's custom ID) to dimension-adapters chain names
const CHAIN_ID_MAP: Record<string, string> = {
  "1":          CHAIN.ETHEREUM,
  "10":         CHAIN.OPTIMISM,
  "56":         CHAIN.BSC,
  "137":        CHAIN.POLYGON,
  "146":        CHAIN.SONIC,
  "999":        CHAIN.HYPERLIQUID,
  "8453":       CHAIN.BASE,
  "42161":      CHAIN.ARBITRUM,
  "43114":      CHAIN.AVAX,
  "1399811149": CHAIN.SOLANA,  // 0x536F6C61 = "SoLa" in ASCII
};

// Reverse map: chain name → chain ID for lookup inside fetch
const CHAIN_NAME_TO_ID = Object.fromEntries(
  Object.entries(CHAIN_ID_MAP).map(([id, name]) => [name, id])
);

// Cache by date so all chains share a single API call
const cache: Record<string, Promise<any>> = {};

const fetchDailyData = (date: string) => {
  if (!cache[date]) {
    const p = httpGet(`${DAILY_VOLUME_URL}?date=${date}`);
    cache[date] = p.catch((err: any) => { delete cache[date]; throw err; });
  }
  return cache[date];
};

const fetch = async (options: FetchOptions) => {
  const date = new Date(options.startTimestamp * 1000).toISOString().slice(0, 10);
  let data: any = null;
  try {
    data = await fetchDailyData(date);
  } catch (e) {
    console.warn(`[genius-protocol] volume API unavailable for ${date}: ${(e as Error).message}`);
    return { dailyVolume: 0 };
  }

  const chainId = CHAIN_NAME_TO_ID[options.chain];
  const chainData = chainId ? data?.chains?.[chainId] : null;
  const dailyVolume = chainData?.total_usd_value ?? 0;

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: Object.values(CHAIN_ID_MAP),
  start: START_DATE,
  methodology: {
    Volume: "Daily trading volume per chain from the Genius Protocol stats API.",
  },
};

export default adapter;
