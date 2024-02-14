import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://abc.endjgfsv.link/swap/scan/volumeall"

interface IVolumeall {
  volume: string;
  tokenPrice: string;
  time: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).data;

  const totalVolume = historicalVolume
    .filter(volItem => (new Date(volItem.time).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.time)) === dayTimestamp)?.volume

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  return (new Date(historicalVolume[0].time).getTime()) / 1000
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TRON]: {
      fetch,
      start: getStartTimestamp,
      customBackfill: customBackfill(CHAIN.TRON as Chain, (_chian: string) => fetch)
    },
  },
};

export default adapter;
