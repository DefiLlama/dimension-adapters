import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://info.pheasantswap.com/swap/operate/getSwapStatisticsList"

interface IVolumeall {
  amount: string;
  date: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).volumeList;
  const dailyVolume = historicalVolume
    .find(dayItem => Number(dayItem.date) === dayTimestamp)?.amount

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ENULS]: {
      fetch,
      start: '2023-04-24',
    },
  },
};

export default adapter;
