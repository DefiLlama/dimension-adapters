import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const meridianDappURL = "https://app.meridian.money/";
const volumeQueryURL = `${meridianDappURL}/api/defillama/trading-volume-chart?timeframe=`;
const feesQueryURL = `${meridianDappURL}/api/defillama/trading-fee-chart?timeframe=`;
const protocolRatioQueryURL = `${meridianDappURL}/api/defillama/protocol-revenue-ratio`;

const volumeEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? volumeQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
    : volumeQueryURL + timeframe;

const feesEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? feesQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
    : feesQueryURL + timeframe;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
  const dayVolumeQuery = (await fetchURL(volumeEndpoint(timestamp, "1D")))
    ?.data;
  const dailyVolume = dayVolumeQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const totalVolumeQuery = (await fetchURL(volumeEndpoint(0, "ALL")))?.data;
  const totalVolume = totalVolumeQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

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

  const protocolFeeRatio = (await fetchURL(protocolRatioQueryURL))?.data;
  const dailyProtocolRevenue = dailyFees * protocolFeeRatio;
  const totalProtocolRevenue = totalFees * protocolFeeRatio;

  console.log(dailyVolume, totalVolume);

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: `${dailyVolume}`,
    totalFees: `${totalFees}`,
    dailyFees: `${dailyFees}`,
    totalProtocolRevenue: `${totalProtocolRevenue}`,
    dailyProtocolRevenue: `${dailyProtocolRevenue}`,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MOVE]: {
      fetch,
      start: "2025-03-09",
    },
  },
};

export default adapter;
