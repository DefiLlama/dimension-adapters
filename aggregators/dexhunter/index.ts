import { postURL } from "../../utils/fetchURL"
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = 'https://api-us.dexhunterv3.app/stats/fear_and_greed';

interface IAPIResponse {
  is_dexhunter: boolean;
  usd_volume: number;
}

const fetchData = async (period: '24h' | 'all'): Promise<string> => {
  const response = await postURL(`${URL}`, { period });
  const data: IAPIResponse[] = response;

  const dexhunterData = data.find(d => d.is_dexhunter);
  if (!dexhunterData) {
    throw new Error('No dexhunter data found');
  }

  return (dexhunterData.usd_volume / 1000000).toString()
}

const fetch = async (): Promise<FetchResult> => {
  const dailyVolume = await fetchData('24h');

  return {
    dailyVolume: dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-05-15',
    },
  },
};

export default adapter;
