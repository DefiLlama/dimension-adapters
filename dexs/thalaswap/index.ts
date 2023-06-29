import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const thalaDappURL = 'https://app.thala.fi/';
const volumeQueryURL = `${thalaDappURL}/api/trading-volume-chart?timeframe=`;
const feesQueryURL = `${thalaDappURL}/api/trading-fee-chart?timeframe=`;
const protocolRatioQueryURL = `${thalaDappURL}/api/protocol-revenue-ratio`;

// if we include a startTimestamp, then pass this in, else don't
const volumeEndpoint = (startTimestamp: number, timeframe: string) => 
    startTimestamp ? volumeQueryURL + timeframe + `&startTimestamp=${startTimestamp}` : volumeQueryURL + timeframe;

const feesEndpoint = (startTimestamp: number, timeframe: string) => 
startTimestamp ? feesQueryURL + timeframe + `&startTimestamp=${startTimestamp}` : feesQueryURL + timeframe;

const historicalEndpoint = "https://app.thala.fi/api/trading-volume-chart?startTimestamp=1680480000";
interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
    const dayVolumeQuery = (await fetchURL(volumeEndpoint(timestamp, "1D")))?.data.data;
    const dailyVolume = dayVolumeQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const totalVolumeQuery = (await fetchURL(volumeEndpoint(0, "ALL")))?.data.data;
    const totalVolume = totalVolumeQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const dayFeesQuery = (await fetchURL(feesEndpoint(timestamp, "1D")))?.data.data;
    const dailyFees = dayFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const totalFeesQuery = (await fetchURL(feesEndpoint(0, "ALL")))?.data.data;
    const totalFees = totalFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);
    
    const protocolFeeRatio = (await fetchURL(protocolRatioQueryURL))?.data.data;
    const dailyProtocolRevenue = dailyFees * protocolFeeRatio;
    const totalProtocolRevenue = totalFees * protocolFeeRatio;

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
    [CHAIN.APTOS]: {
      fetch,
      start: async () => 1680480000
    },
  },
};

export default adapter;
