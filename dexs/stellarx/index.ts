import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://amm-api.stellarx.com/api/pools/30d-statistic/"

interface IVolumeall {
  volume: number;
  time: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const totalVolume = historicalVolume
    .filter(volItem => getUniqStartOfTodayTimestamp(new Date(Number(`${volItem.time}`.split('.')[0]) * 1000)) <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(Number(`${dayItem.time}`.split('.')[0]) * 1000)) === dayTimestamp)?.volume

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  return getUniqStartOfTodayTimestamp(new Date(Number(`${historicalVolume[0].time}`.split('.')[0]) * 1000))
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STELLAR]: {
      fetch,
      start: getStartTimestamp,
      customBackfill: customBackfill(CHAIN.STELLAR as Chain, (_chian: string) => fetch)
    },
  },
};

export default adapter;
