import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://pabc.endjgfsv.link/swapv2/scan/getAllLiquidityVolume"

interface IVolumeall {
  volume: string;
  time: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).data;
  const dailyVolume = historicalVolume
    .find(dayItem =>dayItem.time === dayTimestamp)?.volume

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TRON]: {
      fetch,
      start: '2021-12-14',
    },
  },
};

export default adapter;
