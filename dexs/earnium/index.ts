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
  const dailyProtocolRevenue = Number(earniumData.fees24h) * 0.1;
  const totalProtocolRevenue = Number(earniumData.fees) * 0.1;

  const dailyHoldersRevenue = Number(earniumData.fees24h) - dailyProtocolRevenue;
  const totalHoldersRevenue = Number(earniumData.fees) - totalProtocolRevenue;

  return {
    totalVolume: earniumData.volume,
    dailyVolume: earniumData.volume24h,
    totalFees: earniumData.fees,
    dailyFees: earniumData.fees24h,
    totalRevenue: earniumData.fees,
    dailyRevenue: earniumData.fees24h,
    totalProtocolRevenue,
    dailyProtocolRevenue,
    totalHoldersRevenue,
    dailyHoldersRevenue,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2025-08-10",
    },
  },
};

export default adapter;
