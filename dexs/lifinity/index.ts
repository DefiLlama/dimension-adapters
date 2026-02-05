import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.lifinity.io/api/dashboard/volume"

interface IVolumeall {
  volume: number;
  date: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).volume.daily.data;
  const dateStr = new Date(dayTimestamp * 1000).toLocaleDateString('en-US', { timeZone: 'UTC' })
  const [month, day, year] = dateStr.split('/');
  const formattedDate = `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.date === formattedDate)?.volume;

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).volume.daily.data;
  return (new Date(historicalVolume[0].date).getTime()) / 1000
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: getStartTimestamp,
    },
  },
  deadFrom:'2025-11-21',
};

export default adapter;
