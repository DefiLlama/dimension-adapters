import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const fetch = async ({ dateString }: FetchOptions) => {

  const data = (await fetchURL('https://flamingo-us-1.b-cdn.net/flamingo/analytics/rolling-30-days/total_data'))
  const dayData = data.find((day: any) => day.date.slice(0, 10) === dateString)
  if (!dayData) throw new Error(`No data for date ${dateString}`)

  // Since 2026-08-29 the rollup has served a placeholder for every new day: the per-day activity
  // fields are missing and only the cumulative counters remain, frozen at their 2026-08-28 values.
  // Its total_order_volume reads "0.0", which is indistinguishable from a quiet day, so refuse the
  // row instead of storing that zero. A day that genuinely had no swaps still carries
  // total_transactions, since Neo blocks carry traffic other than Flamingo's.
  if (dayData.total_data?.total_transactions === undefined)
    throw new Error(`Flamingo analytics has not written a row for ${dateString} yet`)

  return { dailyVolume: dayData.total_data.total_order_volume, dailyFees: dayData.total_data.total_order_fee_usd };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: ['neo'],
  start: '2025-08-18',
};

export default adapter;