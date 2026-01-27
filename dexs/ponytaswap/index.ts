// https://www.ponytaswap.finance/v1/info/overview
import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://www.ponytaswap.finance/v1/info/overview"

interface IVolumeall {
  volumeUSD: number;
  date: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).data;

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.date * 1000)) === dayTimestamp)?.volumeUSD

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.RPG]: {
      fetch,
      start: '2023-03-06'
    },
  },
};

export default adapter;
