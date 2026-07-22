/**
 * LumAgg — Stellar DEX aggregator volume (entry notional).
 *
 * Website: https://lumagg.xyz
 * Stats:   https://lumagg.xyz/stats
 * API:     https://api.lumagg.xyz/api/v1/stats?day=YYYY-MM-DD
 * Contract (mainnet): CC6QAV7JEG5MYRSPO5Z65E5G2M4ZB64BEG2ZXIZXL55TQT35JDI2LC6K
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const STATS_API = "https://api.lumagg.xyz/api/v1/stats";

/** First UTC day with indexed aggregator volume. */
const START = "2026-07-13";

interface TokenRow {
  token: string;
  amount_in: number | string;
}

interface DayStats {
  day: string;
  by_token?: TokenRow[];
  total_amount_in_usd?: number | null;
}

interface StatsResponse {
  success?: boolean;
  data?: { daily?: DayStats[] };
}

const fetch = async (options: FetchOptions) => {
  const day = options.dateString;
  const res: StatsResponse = await fetchURL(`${STATS_API}?day=${encodeURIComponent(day)}`);

  if (!res?.success || !res.data?.daily?.length) {
    return { dailyVolume: 0 };
  }

  const row = res.data.daily[0];
  const dailyVolume = options.createBalances();

  // Entry notional per token_in (not hop-weighted routed volume).
  const tokens = row.by_token ?? [];
  let hasTokenVolume = false;
  for (const t of tokens) {
    if (!t.token || t.amount_in == null) continue;
    dailyVolume.add(t.token, t.amount_in);
    hasTokenVolume = true;
  }
  if (hasTokenVolume) {
    return { dailyVolume };
  }

  if (typeof row.total_amount_in_usd === "number" && Number.isFinite(row.total_amount_in_usd)) {
    dailyVolume.addUSDValue(row.total_amount_in_usd, "Swap entry notional");
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Sum of user swap entry amounts (token_in notional) through the LumAgg aggregator contract on Stellar. Multi-hop routed volume (entry × serial hops) is excluded. Source: https://api.lumagg.xyz/api/v1/stats",
};

const breakdownMethodology = {
  Volume: {
    "Swap entry notional":
      "USD entry notional used when token-level amounts are unavailable.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STELLAR],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
