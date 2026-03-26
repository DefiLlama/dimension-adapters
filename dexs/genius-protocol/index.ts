/**
 * Genius Protocol — Volume Adapter
 *
 * Fetches weekly trading volume from the Genius Protocol stats API and returns
 * daily volume for the requested period.
 *
 * API: https://gp-timeseries-api-production.up.railway.app/stats/formatted-weekly-data
 */

import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const WEEKLY_URL =
  "https://gp-timeseries-api-production.up.railway.app/stats/formatted-weekly-data";

const START_DATE = "2026-01-12";

/** Returns the Monday (week start) for the given Unix timestamp as "YYYY-MM-DD". */
function getWeekStart(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

const fetch = async (options: FetchOptions) => {
  const { weekly }: { weekly: { week: string; sol_volume_usd: number; evm_volume_usd: number; total_volume_usd: number }[] } =
    await httpGet(WEEKLY_URL);

  const weekKey = getWeekStart(options.startTimestamp);
  const weekData = weekly?.find((w) => w.week === weekKey);

  // Weekly total divided by 7 gives an average daily volume for the week
  const totalWeeklyVolume = weekData?.total_volume_usd ?? 0;
  const dailyVolume = totalWeeklyVolume / 7;

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM], // multi-chain protocol; volume is reported in aggregate
  start: START_DATE,
  methodology: {
    Volume: "Total weekly trading volume (SOL + EVM chains) from the Genius Protocol stats API, divided by 7 to approximate daily volume.",
  },
};

export default adapter;
