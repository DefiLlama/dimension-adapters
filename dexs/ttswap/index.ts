import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://ttswap.space/api/info"

interface IVolumeall {
  volume24H: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall = (await fetchURL(historicalVolumeEndpoint)).data.overview;
  return {
    dailyVolume: historicalVolume ? `${historicalVolume.volume24H}` : undefined,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.THUNDERCORE]: {
      fetch,
      start: '2023-01-10',
      runAtCurrTime: true
    },
  },
};

export default adapter;
