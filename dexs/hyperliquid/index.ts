import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

const URL = "https://api.hyperliquid.xyz/info";

interface Response {
  totalVolume?: number;
  dailyVolume?: number;
}

const url = (end_date: string) => `https://stats-api.hyperliquid.xyz/hyperliquid/daily_usd_volume?start_date=2023-06-14&end_date=${end_date}`
const fetch = async (timestamp: number) => {
  const nextData = timestamp + 86400;
  const dateStr = new Date(nextData  * 1000).toISOString().split('T')[0]
  const data = (await httpGet(url(dateStr))).chart_data;
  const toDate = new Date(timestamp * 1000).toISOString().split('T')[0];
  const dailyVolume = data.filter((item: any) => item.time.split('T')[0] === toDate)
    .reduce((acc: number, item: any) => acc + item.daily_usd_volume, 0);
  const {totalVolume}: Response = (await httpPost(URL, {"type": "globalStats"}));
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  return {
    totalVolume: totalVolume?.toString(),
    dailyVolume: dailyVolume?.toString(),
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: 1677283200,
    },
  }
};

export default adapter;
