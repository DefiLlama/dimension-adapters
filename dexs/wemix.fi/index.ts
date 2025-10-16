import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.wemix.fi/dashboard/total_chart?type=volume&unit=day&unit_count=24"

interface IVolumeall {
  volume: number;
  timestamp: number;
  dateTime: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).data.history;
  const date = new Date(dayTimestamp * 1000)
  const dateString =  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const dailyVolume = historicalVolume
    .find(dayItem =>  dayItem.dateTime.split(' ')[0] === dateString)?.volume

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.WEMIX]: {
      fetch,
      start: '2023-02-21',
    },
  },
};

export default adapter;
