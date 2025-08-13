import { httpGet } from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const config_rule = {
  headers: {
    "user-agent": "axios/1.6.7",
  },
  withCredentials: true,
};

const earniumEndpoint = (timestamp: number) =>
  "https://api.earnium.io/api/v1/tool/defillama/dimension-adapter?timestamp=" +
  timestamp;

const fetch = async (timestamp: number) => {
  const earniumData = (await httpGet(earniumEndpoint(timestamp), config_rule)).data;
  const dailyRevenue = Number(earniumData.fees24h) * 0.1;
  const totalRevenue = Number(earniumData.fees) * 0.1;

  return {
    totalVolume: earniumData.volume,
    dailyVolume: earniumData.volume24h,
    totalFees: earniumData.fees,
    dailyFees: earniumData.fees24h,
    totalRevenue: totalRevenue,
    dailyRevenue: dailyRevenue,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2025-08-10",
      meta: {
        methodology: {
          Fees: "Total fees from swaps, based on the fee tier of each pool.",
          Revenue: "Revenue is calculated as 10% of the swap fees.",
        },
      },
    },
  },
};

export default adapter;
