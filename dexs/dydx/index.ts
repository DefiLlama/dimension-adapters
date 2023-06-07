import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://dydx.metabaseapp.com/api/public/dashboard/5fa0ea31-27f7-4cd2-8bb0-bc24473ccaa3/dashcard/322/card/234?parameters=%5B%5D"

interface IVolumeall {
  totalVolume: number;
  dailyVolume: number;
  time: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.data.rows
    .map(([time, totalVolume, dailyVolume]: [string, number, number]) => {
      return {
        totalVolume,
        dailyVolume,
        time,
      }
    });

  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const volume = historicalVolume
    .find(dayItem => dayItem.time.split('T')[0] === dateString)
  const findIndex = historicalVolume
  .findIndex(dayItem => dayItem.time.split('T')[0] === dateString)
  let dailyVolume = volume?.dailyVolume;
  if (volume && !dailyVolume) {
    dailyVolume = historicalVolume[findIndex].totalVolume - historicalVolume[findIndex-1].totalVolume
  }
  return {
    totalVolume: volume ? `${volume.totalVolume}` : undefined,
    dailyVolume: dailyVolume && dailyVolume > 0 ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: async () => 1614211200,
    },
  },
};

export default adapter;
