import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const fetch = async (_: any, _1: any, { dateString }: FetchOptions) => {

  const data = (await fetchURL('https://flamingo-us-1.b-cdn.net/flamingo/analytics/rolling-30-days/pool_data'))
  const dayData = data.find((day: any) => day.date.slice(0, 10) === dateString)
  if (!dayData) throw new Error(`No data for date ${dateString}`)
  let dailyVolume = 0;
  let dailyFees = 0

  Object.values(dayData.pool_data).forEach((pool: any) => {
    if (pool.fees_usd_total) dailyFees += +pool.fees_usd_total
    if (pool.volume_usd_total) dailyVolume += +pool.volume_usd_total
  })

  return { dailyVolume, dailyFees, };
};

const adapter: SimpleAdapter = {
  adapter: {
    neo: {
      fetch,
      start: '2025-08-18',
    },
  },
};

export default adapter;