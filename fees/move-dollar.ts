import fetchURL from "../utils/fetchURL";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const thalaDappURL = 'https://app.thala.fi';
const feesQueryURL = `${thalaDappURL}/api/protocol-fee-chart?timeframe=`;

const feesEndpoint = (endTimestamp: number, timeframe: string) => 
endTimestamp ? feesQueryURL + timeframe + `&endTimestamp=${endTimestamp}` : feesQueryURL + timeframe;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const fetch = async (timestamp: number) => {
    const dayFeesQuery = (await fetchURL(feesEndpoint(timestamp, "1D"))).data;
    const dailyFees = dayFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

    const totalFeesQuery = (await fetchURL(feesEndpoint(0, "ALL"))).data;
    const totalFees = totalFeesQuery.reduce((partialSum: number, a: IVolumeall) => partialSum + a.value, 0);

  return {
    totalFees: `${totalFees}`,
    dailyFees: `${dailyFees}`,
    timestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: 1680652406 
    },
  },
};

export default adapter;
