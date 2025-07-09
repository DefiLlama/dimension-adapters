import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://graph.fibrous.finance/starknet/volume";

interface IAPIResponse {
  status: number;
  data: {
    dailyVolume: string;
  };
  message: string;
}

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const response: IAPIResponse = await fetchURL(URL);
  const dailyVolume = response.data.dailyVolume;

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch,
      start: '2023-05-06',
      runAtCurrTime: true
    },
  },
};

export default adapter;
