import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const statsurl = 'https://api.solarstudios.co/pools/info/list?poolType=all&poolSortField=volume24h&sortType=desc&pageSize=1000&page=1';

const fetchVolume = async (timestamp: number, _:any, options: FetchOptions): Promise<any> => {
  const res = await httpGet(statsurl);
  const dailyVolume = options.createBalances();
  res.data.data.map((i: any) => {
    dailyVolume.addUSDValue(Number(i.day.volume))
  });
  return {
    dailyVolume: dailyVolume,
    timestamp: timestamp
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ECLIPSE]: {
      fetch: fetchVolume,
      start: '2024-10-20',
      runAtCurrTime: true
    }
  },
  version: 1
}

export default adapters;
