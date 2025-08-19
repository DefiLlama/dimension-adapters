import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (timestamp: number) => {
  const url = `https://www.api.pearprotocol.io/v1/metric?timestamp=${timestamp}`;
  const response = await httpGet(url);
  const dailyFees = response.payload.dailyFees;
  const dailyRevenue = dailyFees;

  return {
    dailyFees,
    dailyRevenue,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2024-05-08',
    },
  },
};

export default adapter;
