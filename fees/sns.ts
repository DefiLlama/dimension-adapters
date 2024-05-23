import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { httpGet } from "../utils/fetchURL";

const API_URL = "https://sns-api.bonfida.com/v2/defilama/fees-adapter";

interface IData {
  daily_fees: number;
  total_fees: number;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const fromTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const url = `${API_URL}?from=${fromTimestamp}&to=${todaysTimestamp-1}`;
  const data: IData = await httpGet(url);
  return {
    timestamp: todaysTimestamp,
    dailyFees: data.daily_fees.toString(),
    dailyRevenue: data.daily_fees.toString(),
    totalFees: data.total_fees.toString(),
    totalRevenue: data.total_fees.toString(),
  };
};

const methodology = {
  Fees: "registration cost and fees on secondary sales",
  Revenue: "registration revenue and revenue from secondary sales",
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: 1624941677,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
