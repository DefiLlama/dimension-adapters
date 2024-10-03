import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const api = "https://api.deltatrade.ai/api/home/data";

const fetch = async () => {
  const timestamp = getUniqStartOfTodayTimestamp();
  const res = await httpGet(api);
  const { total_24h, total } = res.data;

  return {
    timestamp,
    dailyVolume: total_24h,
    totalVolume: total,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    near: {
      fetch,
      start: 0,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
