import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const thalaDappURL = "https://app.echelon.market";

interface IVolumeall {
  value: number;
  timestamp: string;
}

const chainNetworkMap: any = {
  [CHAIN.APTOS]: "aptos_mainnet",
  [CHAIN.MOVE]: "movement_mainnet",
}

const fetch = async (timestamp: number, _: any, { chain }: FetchOptions) => {
  const feesQueryURL = `${thalaDappURL}/api/defillama/fees?netowrk=${chainNetworkMap[chain]}&timeframe=`;
  const feesEndpoint = (endTimestamp: number, timeframe: string) =>
    endTimestamp
      ? feesQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
      : feesQueryURL + timeframe;

  const dayFeesQuery = (await fetchURL(feesEndpoint(timestamp, "1D")))?.data;
  const dailyFees = dayFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const totalFeesQuery = (await fetchURL(feesEndpoint(0, "ALL")))?.data;
  const totalFees = totalFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  return {
    totalFees,
    dailyFees,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2023-04-03',
    },
    [CHAIN.MOVE]: {
      fetch,
      start: '2023-04-03',
    },
  },
};

export default adapter;
