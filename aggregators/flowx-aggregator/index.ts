import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const fetchVolume = async (_t: number, _b: any, options: FetchOptions) => {
  const start = getTimestampAtStartOfDayUTC(options.startOfDay)
  const url = `https://flowx-finance-mono.vercel.app/api/defillama/aggregator-vol?startTimestamp=${start}&endTimestamp=${start}`;
  const res = await httpGet(url);
  const record = res[0];
  return {
    timestamp: start,
    dailyVolume: record.totalUSD,
  }



};

const adapter: any = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchVolume,
      start: '2024-06-01',
    },
  },
};

export default adapter;
