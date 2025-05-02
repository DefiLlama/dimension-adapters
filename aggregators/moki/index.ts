import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const URL = 'https://api.leapwallet.io/';
const endpoint = 'ton-sor/api/v1/analytics/volumes';

interface IAPIResponse {
  dailyVolume: string;
  totalVolume: string;
}

const fetch: any = async ({ endTimestamp }: FetchOptions) => {
  const { dailyVolume, totalVolume }: IAPIResponse = await fetchURL(`${URL}${endpoint}?timestamp=${endTimestamp * 1000}`);
  return {
    dailyVolume,
    totalVolume
  };
};

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      start: "2024-09-30",
      fetch
    }
  }
}
export default adapters
