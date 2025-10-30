import { httpGet } from "../utils/fetchURL";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
const config_rule = {
  headers: {
    "user-agent": "axios/1.6.7",
  },
  withCredentials: true,
};

const collexDappUrl =
  "https://api.collex.fun/api/v1/tool/defillama/dimension-adapters?type=";

const dayEndpoint = (endTimestamp: number, timeframe: string) =>
  collexDappUrl + timeframe + `&endTimestamp=${endTimestamp}`;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
  const dayVolumeQuery = await httpGet(
    dayEndpoint(timestamp, "VOLUME_1H"),
    config_rule
  );
  const dailyVolume = dayVolumeQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const dayFeesQuery = await httpGet(dayEndpoint(timestamp, "FEE_1H"), config_rule);
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
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2025-10-08",
    },
  },
};

export default adapter;
