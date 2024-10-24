import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const dateToTs = (date: string) => new Date(date).getTime() / 1000
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
    solana: {
      fetch,
      runAtCurrTime: true,
      start: async()=>{
        const data = await httpGet(api)
        return dateToTs(data[0].date)
      },
    },
  },
};

export default adapter;
