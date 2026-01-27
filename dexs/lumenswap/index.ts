import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.lumenswap.io/amm/stats/overall"

interface IVolumeall {
  volume: string;
  tokenPrice: string;
  periodTime: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));

const dailyVolume = historicalVolume
  .find(dayItem => (new Date(dayItem.periodTime.split('T')[0]).getTime() / 1000) === dayTimestamp)?.volume

  return {
    dailyVolume: dailyVolume ? `${Number(dailyVolume) / 10 ** 7}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STELLAR]: {
      fetch,
      start: '2022-04-01',
    },
  },
};

export default adapter;
