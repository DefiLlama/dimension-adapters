import { httpPost } from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


interface IVolumeall {
  dailyVolumeUSD: string;
  date: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolumeEndpoint = "https://www.vanswap.org/info/DayDatas?first=10&date=" + (timestamp - 86400 * 2)
  const historicalVolume: IVolumeall[] = (await httpPost(historicalVolumeEndpoint, null))?.result;
  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime()) === dayTimestamp)?.dailyVolumeUSD

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.VISION]: {
      fetch,
      start: 1647302400
    },
  },
};

export default adapter;
