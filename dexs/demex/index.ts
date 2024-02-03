import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const START_TIME = 1659312000;
const historicalVolumeEndpoint = (until: number) => `https://api-insights.carbon.network/market/volume?from=${START_TIME}&interval=day&until=${until}`

interface IVolumeall {
  volumeValue: string;
  totalVolumeValue: string;
  date: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(dayTimestamp)))?.data.result.entries;

  const volume = historicalVolume
    .find(dayItem => (new Date(dayItem.date.split('T')[0]).getTime() / 1000) === dayTimestamp)

  return {
    totalVolume: `${volume?.totalVolumeValue}`,
    dailyVolume: volume ? `${volume.volumeValue}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CARBON]: {
      fetch,
      start: START_TIME,
    },
  },
};

export default adapter;