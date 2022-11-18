import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import fetchURL from "../utils/fetchURL";

const historicalVolumeEndpoint = "https://lifinity.io/api/dashboard/volume"

interface IVolumeall {
  fees: number;
  date: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.volume.daily.data;
  const totalFees = historicalVolume
    .filter(volItem => Number(new Date(volItem.date.split('/').join('-')).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { fees }) => acc + Number(fees), 0);

  const dailyFees = historicalVolume
    .find(dayItem => Number(new Date(dayItem.date.split('/').join('-')).getTime() / 1000) === dayTimestamp)?.fees;
  const dailyFeesUsd = (dailyFees || 0);
  const dailyRevenue = dailyFeesUsd * 0.15;
  const totalRevenue = totalFees * 0.15;
  return {
    dailyFees: dailyFeesUsd.toString(),
    dailyRevenue: dailyRevenue.toString(),
    totalFees: totalFees.toString(),
    totalRevenue: totalRevenue.toString(),
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.volume.daily.data;
  return Number(new Date(historicalVolume[0].date.split('/').join('-')).getTime() / 1000)
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: getStartTimestamp,
    },
  }
}
export default adapter;
