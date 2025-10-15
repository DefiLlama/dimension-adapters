import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const URL = 'https://api.leapwallet.io/ton-sor/api/v1/analytics/volumes';

interface IAPIResponse {
  dailyVolume: string;
}

const fetch: any = async (_a:any, _b:any, options: FetchOptions) => {
  const { dailyVolume }: IAPIResponse = await fetchURL(`${URL}?timestamp=${options.startTimestamp * 1000}`);
  return {
    dailyVolume
  };
};

const adapters: SimpleAdapter = {
  version: 1,
  deadFrom: '2025-05-29',
  adapter: {
    [CHAIN.TON]: {
      start: "2024-09-30",
      fetch
    }
  }
}
export default adapters
