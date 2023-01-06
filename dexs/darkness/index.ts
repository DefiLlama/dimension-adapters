import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.darkcrypto.finance/api/darkness"

interface IAPIResponse {
  volume24h: number;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse = (await fetchURL(URL))?.data?.data;
  const dailyVolume = response.volume24h;

  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CRONOS]: {
      fetch,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: async () => 1672790400,
    },
  }
};

export default adapter;
