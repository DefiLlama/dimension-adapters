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
  const todayDateString = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.time === todayDateString)?.volume
  // The API only serves the last 365 days, so older days (and today, until it ends) have no row.
  if (dailyVolume === undefined)
    throw new Error(`increment-swap: the API has no volume for ${todayDateString}, it covers ${historicalVolume[0]?.time} to ${historicalVolume.at(-1)?.time}`)

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
