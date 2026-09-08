import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const thalaDappURL = "https://app.thala.fi";
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

const fetch = async (options: FetchOptions) => {
  const dayVolumeQuery = (await fetchURL(volumeEndpoint(options.toTimestamp, "1D")))?.data;
  const dailyVolume = dayVolumeQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);


  const dayFeesQuery = (await fetchURL(feesEndpoint(options.toTimestamp, "1D")))?.data;
  const dailyFees = dayFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  const dayRevenueQuery = (await fetchURL(revenueEndpoint(options.toTimestamp, "1D")))?.data;
  const dailyRevenue = dayRevenueQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);


  return {
    dailyVolume: dailyVolume,
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.APTOS],
  start: '2023-04-05',
  // Thala's API stopped serving the thalaswap-v2 series on 2026-05-14
  // (timeframe=1D returns `{}` for any endTimestamp; the full series returned by
  // timeframe=7D ends at 2026-05-14, matching DefiLlama's last stored datapoint).
  // The product was superseded by ThalaSwap v3 (see dexs/thalaswap-v3.ts).
  // NOTE: the API's fallback series for unknown project values is the v1
  // ("thalaswap") series — do NOT point this adapter at it, that double-counts v1.
  deadFrom: '2026-05-14',
};

export default adapter;
