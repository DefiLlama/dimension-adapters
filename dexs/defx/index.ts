import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const URL = "https://api.defx.com/v1/open/analytics/market/overview";

interface Response {
  data:{
    totalVol?: string;
    dayVol?: string;
  }
}

const fetch = async (timestamp: number) => {
  const response: Response = (await httpGet(URL));
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  
  const returnObj = {
    totalVolume: response?.data.totalVol?.toString(),
    dailyVolume: response?.data.dayVol?.toString(),
    timestamp: dayTimestamp,
  };
  
  return returnObj;
};

const adapter: SimpleAdapter = {
  adapter: {
    "defx": {
      fetch,
      start: 1727780831,
      runAtCurrTime: true
    },
  }
};

export default adapter;
