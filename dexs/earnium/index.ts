import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const config_rule = {
  headers: {
    "user-agent": "axios/1.6.7",
  },
  withCredentials: true,
};


const fetch = async (_a:any, _b:any, options:FetchOptions) => {
  const url = "https://api.earnium.io/api/v1/tool/defillama/dimension-adapter?timestamp=" + options.startOfDay;
  const earniumData = (await httpGet(url, config_rule)).data;
  const dailyFees = Number(earniumData.fees24h)
  const dailyVolume = Number(earniumData.volume24h)
  const dailyProtocolRevenue = dailyFees * 0.01;
  const dailySupplySideRevenue = dailyFees * 0.9;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "swap fees paid by users on each trade",
  UserFees: "swap fees paid by users on each trade",
  Revenue: "1% of swap fees goes to protocol",
  ProtocolRevenue: "1% of swap fees goes to protocol",
  HoldersRevenue: "No holders revenue",
  SupplySideRevenue: "90% of swap fees goes to LPs"
}

const adapter: SimpleAdapter = {
  fetch,
  methodology,
  chains: [CHAIN.APTOS],
  start: '2025-08-10',
};

export default adapter;
