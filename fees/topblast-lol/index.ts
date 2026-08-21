/**
 * Topblast / GroypFi — Fees & Revenue on TON
 *
 * 1% platform fee on every swap routed through the aggregator
 * (DeDust, STON.fi, Tonco, Bidask). 100% of fees are protocol revenue
 * used for GROYP buybacks.
 *
 * Data source: public, no-API-key stats endpoint
 *   https://gyihzeiwelsuikfrschp.supabase.co/functions/v1/defillama?date=YYYY-MM-DD
 *
 * The endpoint reads incoming TON transfers to the on-chain house fee wallet:
 *   UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q
 *   0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS_API = "https://gyihzeiwelsuikfrschp.supabase.co/functions/v1/defillama";

interface DayStats {
  date: string;
  dailyFees: number;
  dailyUserFees: number;
  dailyRevenue: number;
  dailyHoldersRevenue: number;
  dailyVolume: number;
}

const fetch = async (options: FetchOptions) => {
  const date = new Date(options.startTimestamp * 1000)
    .toISOString()
    .slice(0, 10);

  const stats: DayStats = await httpGet(`${STATS_API}?date=${date}`);

  return {
    dailyFees: stats.dailyFees,
    dailyUserFees: stats.dailyUserFees,
    dailyRevenue: stats.dailyRevenue,
    dailyHoldersRevenue: stats.dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "1% platform fee collected on-chain at the house fee wallet from all swap sources (Swap Widget, Terminal, Launchpad, @groypfi_bot).",
  UserFees: "Same as Fees — users pay the 1% platform fee on every swap.",
  Revenue: "100% of fees are protocol revenue used for GROYP token buybacks.",
  HoldersRevenue: "100% of revenue is used for GROYP token buybacks, benefiting token holders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: "2026-05-01",
      meta: { methodology },
    },
  },
};

export default adapter;
