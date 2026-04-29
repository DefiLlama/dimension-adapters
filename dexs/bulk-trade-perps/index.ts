import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS_URL = "https://exchange-api.bulk.trade/api/v1/stats?period=1d";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type StatsResponse = {
  timestamp: number;
  period: string;
  volume: {
    totalUsd: number;
  };
  openInterest: {
    totalUsd: number;
  };
};

const fetch: FetchV2 = async () => {
  const data = await httpGet(STATS_URL) as StatsResponse;

  // Bulk's stats endpoint is a live 24h rolling snapshot, so we only trust it
  // when the server timestamp is recent.
  if (Math.abs(Date.now() - data.timestamp) > ONE_DAY_MS) {
    throw new Error("Bulk Trade stats are stale (older than 24h)");
  }

  return {
    // The API returns exchange-wide USD volume for the trailing 24h window.
    dailyVolume: data.volume?.totalUsd ?? 0,
    // Open interest is already normalized to total USD notional.
    openInterestAtEnd: data.openInterest?.totalUsd ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Bulk currently exposes only a current rolling snapshot. The documented 7d,
  // 30d and 1y period params still return the same 24h stats, so backfill and
  // true historical timetravel are not reliable yet.
  timetravel: false,
  adapter: {
    [CHAIN.OFF_CHAIN]: {
      fetch,
      runAtCurrTime: true,
      start: "2025-12-01",
    },
  },
  methodology: {
    Volume: "Volume uses Bulk Trade's public /stats endpoint and reads the exchange-level 24h rolling USD volume. Historical backfill is not supported because Bulk currently documents all period values as returning the same 24h rolling stats.",
    OpenInterest: "Open interest uses Bulk Trade's public /stats endpoint and reads the exchange-level total USD open interest from the current snapshot.",
  },
};

export default adapter;
