import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const fetch = async (_: any, _1: any, { dateString }: FetchOptions) => {

  const data = (await fetchURL('https://flamingo-us-1.b-cdn.net/flamingo/analytics/rolling-30-days/total_data'))
  const dayData = data.find((day: any) => day.date.slice(0, 10) === dateString)
  if (!dayData) throw new Error(`No data for date ${dateString}`)

  return { dailyVolume: dayData.total_data.total_order_volume, dailyFees: dayData.total_data.total_order_fee_usd };
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