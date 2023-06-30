import fetchURL from "../utils/fetchURL";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const thalaDappURL = 'https://app.thala.fi/';
const volumeQueryURL = `${thalaDappURL}/api/trading-volume-chart?timeframe=`;
const feesQueryURL = `${thalaDappURL}/api/trading-fee-chart?timeframe=`;
const protocolRatioQueryURL = `${thalaDappURL}/api/protocol-revenue-ratio`;

const feesEndpoint = (startTimestamp: number, timeframe: string) =>
startTimestamp ? feesQueryURL + timeframe + `&startTimestamp=${startTimestamp}` : feesQueryURL + timeframe;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
    const dayTime = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dayFeesQuery = (await fetchURL(feesEndpoint(dayTime, "1D")))?.data.data;
    const dailyFees = dayFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const totalFeesQuery = (await fetchURL(feesEndpoint(0, "ALL")))?.data.data;
    const totalFees = totalFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

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
      start: async () => 1680480000
    },
  },
};

export default adapter;
