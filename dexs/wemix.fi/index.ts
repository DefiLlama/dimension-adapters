import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://api.wemix.fi/dashboard/total_chart?type=volume&unit=day&unit_count=24"

interface IVolumeall {
  volume: number;
  timestamp: number;
  dateTime: string;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).data.history;
  const date = new Date(options.startOfDay * 1000)
  const dateString =  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const dailyVolume = historicalVolume
    .find(dayItem =>  dayItem.dateTime.split(' ')[0] === dateString)?.volume

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.WEMIX],
  start: '2023-02-21',
};

export default adapter;
