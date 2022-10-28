import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://lifinity.io/api/dashboard/volume"

interface IVolumeall {
  volume: number;
  date: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.volume.daily.data;
  const totalVolume = historicalVolume
    .filter(volItem => getUniqStartOfTodayTimestamp(new Date(volItem.date)) <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0);

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.date)) === dayTimestamp)?.volume;

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.volume.daily.data;
  return (new Date(historicalVolume[0].date).getTime()) / 1000
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: getStartTimestamp,
      customBackfill: customBackfill(CHAIN.SOLANA as Chain, (_chian: string) => fetch)
    },
  },
};

export default adapter;
