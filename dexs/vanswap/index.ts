import { httpPost } from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


interface IVolumeall {
  dailyVolumeUSD: string;
  date: number;
}

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.toTimestamp * 1000))
  const historicalVolumeEndpoint = "https://www.vanswap.org/info/DayDatas?first=10&date=" + (options.toTimestamp - 86400 * 2)
  const historicalVolume: IVolumeall[] = (await httpPost(historicalVolumeEndpoint, null))?.result;
  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime()) === dayTimestamp)?.dailyVolumeUSD

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.VISION],
  start: 1647302400,
};

export default adapter;
