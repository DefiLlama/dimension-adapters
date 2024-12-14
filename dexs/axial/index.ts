import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://axial-api.snowapi.net/pools"

interface IAPIResponse {
  last_vol: string;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse[] = (await fetchURL(URL));
  const dailyVolume = response
    .reduce((acc, { last_vol }) => acc + Number(last_vol), 0);

  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-01-03',
    },
  }
};

export default adapter;
