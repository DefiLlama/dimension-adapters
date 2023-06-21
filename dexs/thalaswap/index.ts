import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const thalaDappURL = 'https://app.thala.fi';
const baseQueryURL = `${thalaDappURL}/api/trading-volume-chart?timeframe=`;
// if we include a startTimestamp, then pass this in, else don't
const volumeEndpoint = (startTimestamp: number, timeframe: string) =>
    startTimestamp ? baseQueryURL + timeframe + `&startTimestamp=${startTimestamp}` : baseQueryURL + timeframe;

const historicalEndpoint = "https://app.thala.fi/api/trading-volume-chart?startTimestamp=1680480000";
interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const dayQuery = (await fetchURL(historicalEndpoint))?.data.data;
    const dailyVolume = dayQuery.find((e: IVolumeall) => Number(e.timestamp) === dayTimestamp).value

    const totalQuery = (await fetchURL(volumeEndpoint(0, "ALL")))?.data.data;
    const totalVolume = totalQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: `${dailyVolume}`,
    timestamp: dayTimestamp,
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
