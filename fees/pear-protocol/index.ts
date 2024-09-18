import { Adapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (timestamp: number) => {
  const url = "https://www.api.pearprotocol.io/v1/metric";
  const response = await httpGet(url);
  const totalFees = response.payload.totalFees;
  const dailyFees = response.payload.dailyFees;
  const dailyRevenue = dailyFees;
  const totalRevenue = totalFees;

  return {
    dailyFees,
    totalFees,
    dailyRevenue,
    totalRevenue,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: 1715199684,
    },
  },
};

export default adapter;
