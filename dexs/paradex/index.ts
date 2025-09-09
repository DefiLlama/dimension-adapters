import fetchURL from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// const historicalVolumeEndpoint = (market: string, start: number, end: number) => `https://api.prod.paradex.trade/v1/markets/summary?market=${market}&start=${start}&end=${end}`
// const marketsEndpoint = "https://api.prod.paradex.trade/v1/markets"
const volumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/10655/card/9655?parameters=%5B%5D'


interface IVolumeData {
  data: {
    rows: [string, string, number][];
  }
}


const fetch = async (timestamp: number): Promise<FetchResultVolume> => {

  const volumesData = await fetchURL(volumeEndpoint) as IVolumeData
  const timestampStr = new Date(timestamp * 1000).toISOString().split('T')[0] + "T00:00:00Z"
  const dailyVolume = volumesData.data.rows.find(row => ((row[0] === timestampStr)))?.[2]
  if (!dailyVolume) throw new Error('record missing!')

    return { 
        timestamp,
        dailyVolume
        // totalVolume: totalVol
    };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2023-09-01',
    },
  },
};

export default adapter; 