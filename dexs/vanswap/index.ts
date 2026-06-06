import { httpPost } from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


interface IVolumeall {
  dailyVolumeUSD: string;
  date: number;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolumeEndpoint = "https://www.vanswap.org/info/DayDatas?first=10&date=" + (options.toTimestamp - 86400 * 2)
  const historicalVolume: IVolumeall[] = (await httpPost(historicalVolumeEndpoint, null))?.result;
  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime()) === options.startOfDay)?.dailyVolumeUSD

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
