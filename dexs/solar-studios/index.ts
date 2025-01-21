import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const statsurl = 'https://stats.invariant.app/svm/full_snap/eclipse-mainnet';

const fetchVolume = async (timestamp: number, _:any, options: FetchOptions): Promise<any> => {
  const res = await httpGet(statsurl);
  const dailyVolume = options.createBalances();
  const dayItem = res.volumePlot
    .find((item: any) => getTimestampAtStartOfDayUTC(Number(item.timestamp) / 1e3) === options.startOfDay);
  const volume = dayItem ? Number(dayItem.value) : 0;
  dailyVolume.addUSDValue(volume);
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
    }
  }
}

export default adapters;
