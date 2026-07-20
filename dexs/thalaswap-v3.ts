import fetchURL from "../utils/fetchURL";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const thalaDappURL = "https://app.thala.fi/";
const volumeQueryURL = `${thalaDappURL}/api/defillama/trading-volume-chart?project=thalaswap-v3&timeframe=`;
const feesQueryURL = `${thalaDappURL}/api/defillama/trading-fee-chart?project=thalaswap-v3&timeframe=`;
const revenueQueryURL = `${thalaDappURL}/api/defillama/protocol-revenue-chart?project=thalaswap-v3&timeframe=`;

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

// The 1D endpoints return 30-minute buckets, but each datapoint is emitted twice —
// once at :30 and again at the following :00 with the identical value — so summing
// every bucket counts each hour of activity twice.
const sumBuckets = (points: IVolumeall[]) => {
  const sorted = [...points].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  return sorted.reduce((total: number, point: IVolumeall, i: number) => {
    const previous = sorted[i - 1];
    const isRepeat =
      previous !== undefined &&
      Number(point.timestamp) - Number(previous.timestamp) === 1800 &&
      Number(point.value) === Number(previous.value);
    return isRepeat ? total : total + Number(point.value);
  }, 0);
};

const fetch = async (options: FetchOptions) => {
  const dayVolumeQuery = (await fetchURL(volumeEndpoint(options.toTimestamp, "1D")))?.data;
  const dailyVolume = sumBuckets(dayVolumeQuery);


  const dayFeesQuery = (await fetchURL(feesEndpoint(options.toTimestamp, "1D")))?.data;
  const dailyFees = sumBuckets(dayFeesQuery);

  const dayRevenueQuery = (await fetchURL(revenueEndpoint(options.toTimestamp, "1D")))?.data;
  const dailyRevenue = sumBuckets(dayRevenueQuery);


  return {
    dailyVolume: dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue: dailyFees - dailyRevenue,
  };
};

const methodology = {
  Volume: "Trading volume across all ThalaSwap v3 pools, summed from the protocol's trading-volume API.",
  Fees: "Total swap fees paid by traders, summed from the protocol's trading-fee API.",
  Revenue: "The protocol's cut of swap fees that accrues to the treasury, from the protocol's protocol-revenue API.",
  SupplySideRevenue: "The portion of swap fees that accrues to liquidity providers, computed as total fees minus protocol revenue.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.APTOS],
  start: '2025-09-04',
  methodology,
};

export default adapter;
