import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface IData {
  timestamp: number;
  feesKwenta: number;
}
const url = 'https://storage.kwenta.io/25710180-23d8-43f4-b0c9-5b7f55f63165-bucket/data/stats/daily_stats.json';

const fetch = async (timestamp: number, _a: any, _b: any) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const value: IData[] = (await fetchURL(url));
  const dailyFee = value.find((d) => d.timestamp === todaysTimestamp)?.feesKwenta;

  return {
    dailyFees: dailyFee,
    timestamp: todaysTimestamp
  }
}

const adapter: SimpleAdapter = {
  deadFrom: "2024-12-14",
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2023-04-22',
    },
  }
};

export default adapter;
