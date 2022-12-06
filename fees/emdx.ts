import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import axios from "axios";

const endpoint = "https://statistics-api.emdx.io/fee";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const response = await axios.get(`${endpoint}?date=${dayTimestamp}`);

  return {
    timestamp: dayTimestamp,
    totalFees: `${response?.data?.cumulative_fees || 0}`,
    dailyFees: `${response?.data?.volume || 0}`,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: async () => 1653134400
    },
  }
}

export default adapter;
