import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.algofi.org/protocolStats"

interface IAPIResponse {
  total_usd: number;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse = (await fetchURL(URL))?.data.amm.volume.day;

  return {
    dailyVolume: `${response}`,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ALGORAND]: {
      fetch,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: async () => 0,
    },
  }
};

export default adapter;
