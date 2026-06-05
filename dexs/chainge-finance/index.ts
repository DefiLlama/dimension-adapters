import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api2.chainge.finance/thirdparty/dao/getDashboardInfo"

interface IAPIResponse {
  dayVolume: number;
};

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.toTimestamp * 1000))
  const response: IAPIResponse = (await fetchURL(URL)).data;
  return {
    dailyVolume: `${response?.dayVolume}` || undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  deadFrom: "2026-04-01",
  fetch,
  chains: [CHAIN.FUSION],
  runAtCurrTime: true,
};

export default adapter;
