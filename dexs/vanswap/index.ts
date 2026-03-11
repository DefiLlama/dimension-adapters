import { httpPost } from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://www.vanswap.org/info/DayDatas?first=1000&date=1577836800"

interface IVolumeall {
  dailyVolumeUSD: string;
  date: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await httpPost(historicalVolumeEndpoint, null))?.result;
  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime()) === dayTimestamp)?.dailyVolumeUSD

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  //const historicalVolume: IVolumeall[] = (await httpPost(historicalVolumeEndpoint))?.result;
  //return (new Date(historicalVolume[0].date).getTime());
  return 1647302400
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.VISION]: {
      fetch,
      start: getStartTimestamp
    },
  },
};

export default adapter;
