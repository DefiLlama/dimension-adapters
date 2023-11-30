import axios from "axios";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const API_URL = "https://sns-api.bonfida.com/v2/defilama/fees-adapter";

interface IData {
  daily_fees: number;
  total_fees: number;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

  const url = `${API_URL}?from=${todaysTimestamp}&to=${timestamp}`;
  const { data }: { data: IData } = await axios.get(url);
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
      start: async () => 1624941677,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
