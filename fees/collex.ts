import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const config_rule = {
  headers: {
    "user-agent": "axios/1.6.7",
  },
  withCredentials: true,
};

const collexDappUrl = "https://api.collex.fun/api/v1/tool/defillama/dimension-adapters?type=";

const dayEndpoint = (endTimestamp: number, timeframe: string) =>
  collexDappUrl + timeframe + `&endTimestamp=${endTimestamp}`;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dayVolumeQuery = await httpGet(
    dayEndpoint(options.startOfDay, "VOLUME_1H"),
    config_rule
  );
  const dailyVolume = dayVolumeQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const dayFeesQuery = await httpGet(dayEndpoint(options.startOfDay, "FEE_1H"), config_rule);
  const dailyFees = dayFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const dailyProtocolRevenue = dailyFees;
  const dailyHoldersRevenue = 0;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.APTOS],
  start: '2025-10-08',
  deadFrom: '2026-03-13', 
  methodology: {
    Fees: "Fees from the Collex marketplace/trading.",
    Revenue: "Revenue from the Collex marketplace/trading.",
  },
};

export default adapter;
