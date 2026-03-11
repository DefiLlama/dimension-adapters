import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const thalaDappURL = "https://app.thala.fi/";
const volumeQueryURL = `${thalaDappURL}/api/defillama/trading-volume-chart?project=thalaswap-v2&timeframe=`;
const feesQueryURL = `${thalaDappURL}/api/defillama/trading-fee-chart?project=thalaswap-v2&timeframe=`;
const revenueQueryURL = `${thalaDappURL}/api/defillama/protocol-revenue-chart?project=thalaswap-v2&timeframe=`;

const volumeEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? volumeQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
    : volumeQueryURL + timeframe;

const feesEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? feesQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
    : feesQueryURL + timeframe;

const revenueEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? revenueQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
    : revenueQueryURL + timeframe;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
  const dayVolumeQuery = (await fetchURL(volumeEndpoint(timestamp, "1D")))?.data;
  const dailyVolume = dayVolumeQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);


  const dayFeesQuery = (await fetchURL(feesEndpoint(timestamp, "1D")))?.data;
  const dailyFees = dayFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  const dayRevenueQuery = (await fetchURL(revenueEndpoint(timestamp, "1D")))?.data;
  const dailyRevenue = dayRevenueQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);


  return {
    dailyVolume: dailyVolume,
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2023-04-05',
    },
  },
};

export default adapter;
