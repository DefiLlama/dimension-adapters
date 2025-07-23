import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api2.chainge.finance/thirdparty/dao/getDashboardInfo"

interface IAPIResponse {
  dayVolume: number;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse = (await fetchURL(URL)).data;
  return {
    dailyVolume: `${response?.dayVolume}` || undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FUSION]: {
      fetch,
      runAtCurrTime: true,
    },
  }
};

export default adapter;
