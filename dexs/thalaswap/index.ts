import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const thalaDappURL = 'https://app.thala.fi';
const baseQueryURL = `${thalaDappURL}/api/trading-volume-chart?timeframe=`;
// if we include a startTimestamp, then pass this in, else don't
const volumeEndpoint = (startTimestamp: number, timeframe: string) => 
    startTimestamp ? baseQueryURL + timeframe + `&startTimestamp=${startTimestamp}` : baseQueryURL + timeframe;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
    const dayQuery = (await fetchURL(volumeEndpoint(timestamp, "1D")))?.data.data;
    const dailyVolume = dayQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const totalQuery = (await fetchURL(volumeEndpoint(0, "ALL")))?.data.data;
    const totalVolume = totalQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: `${dailyVolume}`,
    timestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: async () => 1680652406 
    },
  },
};

export default adapter;
