import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const feesQueryURL = "https://app.echelon.market/api/defillama/fees?timeframe=";
const revenueQueryURL = "https://app.echelon.market/api/defillama/revenue?timeframe=";

interface IVolumeall {
  value: number;
  timestamp: string;
}

const feesEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? feesQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
    : feesQueryURL + timeframe;

const movementFeesEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? feesQueryURL + timeframe + `&endTimestamp=${endTimestamp}` + "&network=movement_mainnet"
    : feesQueryURL + timeframe + "&network=movement_mainnet";

const revenueEndpoint = (endTimestamp: number, timeframe: string) =>
    endTimestamp
        ? revenueQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
        : revenueQueryURL + timeframe;

const movementRevenueEndpoint = (endTimestamp: number, timeframe: string) =>
    endTimestamp
        ? revenueQueryURL + timeframe + `&endTimestamp=${endTimestamp}` + "&network=movement_mainnet"
        : revenueQueryURL + timeframe + "&network=movement_mainnet";

const config: Record<string, (endTimestamp: number, timeframe: string) => string> = {
  [CHAIN.APTOS]: feesEndpoint,
  [CHAIN.MOVE]: movementFeesEndpoint,
}

const revenueConfig: Record<string, (endTimestamp: number, timeframe: string) => string> = {
  [CHAIN.APTOS]: revenueEndpoint,
  [CHAIN.MOVE]: movementRevenueEndpoint,
}
    
const fetch = async (timestamp: number, _:any, options: FetchOptions) => {
  const dayFeesQuery = (await fetchURL(config[options.chain](timestamp, "1D")))?.data;
  const dailyFees = dayFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const dayRevenueQuery = (await fetchURL(revenueConfig[options.chain](timestamp, "1D")))?.data;
  const dailyRevenue = dayRevenueQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2024-04-25',
    },
    [CHAIN.MOVE]: {
      fetch,
      start: '2025-03-15',
    },
  },
};

export default adapter;
