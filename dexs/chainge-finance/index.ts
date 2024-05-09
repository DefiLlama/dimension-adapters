import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://info.chainge.finance/api/v1/info/getTotalValue"

interface IAPIResponse {
  totalVolume: number;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse = (await fetchURL(URL)).data.Total;
  return {
    dailyVolume: `${response?.totalVolume}` || undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FUSION]: {
      fetch,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 0,
    },
  }
};

export default adapter;
