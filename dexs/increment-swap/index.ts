import fetchURL from "../../utils/fetchURL";
import { ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://app.increment.fi/info/totalinfos"

interface IVolumeall {
  volume: string;
  time: string;
}


const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const callhistoricalVolume = (await fetchURL(historicalVolumeEndpoint)).vol;
  const historicalVolume: IVolumeall[] = callhistoricalVolume.map((e: string[] | number[]) => {
    const [time, volume] = e;
    return {
      time,
      volume
    };
  });
  const date = new Date(options.startOfDay * 1000);
  const todayDateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.time === todayDateString)?.volume

  return {
    dailyVolume: dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.FLOW],
  start: '2022-04-25',
};

export default adapter;
