import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://amm-api.stellarx.com/api/pools/30d-statistic/"

interface IVolumeall {
  volume: number;
  time: number;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(Number(`${dayItem.time}`.split('.')[0]) * 1000)) === options.startOfDay)?.volume
  if (!dailyVolume) throw new Error(`No daily volume found for timestamp: ${options.startOfDay}`);

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STELLAR],
  start: '2024-03-11',
};

export default adapter;
