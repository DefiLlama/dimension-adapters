import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = 'https://vetrade.vet/api/index/analytics/volumes/';

interface IAPIResponse {
  date: number;
  volume_vet: number;
  volume_usd: number;
  trade_count: number;
  last_updated: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const dateString = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  const { volume_usd: dailyVolume }: IAPIResponse = (await fetchURL(`${URL}${dateString}`));
  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.VECHAIN]: {
      fetch,
      start: '2025-04-01',
    },
  },
};

export default adapter;
