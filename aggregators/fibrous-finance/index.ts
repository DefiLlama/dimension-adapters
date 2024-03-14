import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const URL = "https://stats.fibrous.finance/volume";

interface IAPIResponse {
  status: number;
  data: {
    dailyVolume: string;
    totalVolume: string;
  };
  message: string;
}
const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const response: IAPIResponse = await fetchURL(`${URL}`);
  const dailyVolume = response.data.dailyVolume;
  const totalVolume = response.data.totalVolume;
  return {
    dailyVolume,
    totalVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch,
      start: 1683408691,
      runAtCurrTime: true
    },
  },
};

export default adapter;
