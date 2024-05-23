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

const historicalEndpoint = "https://app.thala.fi/api/trading-fee-chart";
interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
    const dayTime = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dayFeesQuery = (await fetchURL(historicalEndpoint))?.data;
    const dailyFees = dayFeesQuery.find((a:IVolumeall) => Number(a.timestamp) === dayTime)?.value;

    const totalFeesQuery = (await fetchURL(feesEndpoint(0, "ALL")))?.data;
    const totalFees = totalFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const protocolFeeRatio = (await fetchURL(protocolRatioQueryURL))?.data;
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
