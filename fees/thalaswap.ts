import fetchURL from "../utils/fetchURL";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const thalaDappURL = "https://app.thala.fi";
const feesQueryURL = `${thalaDappURL}/api/defillama/trading-fee-chart?timeframe=`;
const protocolRatioQueryURL = `${thalaDappURL}/api/defillama/protocol-revenue-ratio`;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const feesEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? feesQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
    : feesQueryURL + timeframe;

const fetch = async (timestamp: number) => {
  const dayFeesQuery = (await fetchURL(feesEndpoint(timestamp, "1D")))?.data
    .data;
  const dailyFees = dayFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const totalFeesQuery = (await fetchURL(feesEndpoint(0, "ALL")))?.data.data;
  const totalFees = totalFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const protocolFeeRatio = (await fetchURL(protocolRatioQueryURL))?.data.data;
  const dailyProtocolRevenue = dailyFees * protocolFeeRatio;
  const totalProtocolRevenue = totalFees * protocolFeeRatio;

  return {
    totalFees: `${totalFees}`,
    dailyFees: `${dailyFees}`,
    totalProtocolRevenue: `${totalProtocolRevenue}`,
    dailyProtocolRevenue: `${dailyProtocolRevenue}`,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: 1680480000
    },
  },
};

export default adapter;
