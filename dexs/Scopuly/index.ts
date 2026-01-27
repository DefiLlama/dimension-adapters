import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.scopuly.com/api/liquidity_pools_volume"

interface IVolumeall {
  vol: number;
  time: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(Number(dayItem.time))) === dayTimestamp)?.vol

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STELLAR]: {
      fetch,
      start: '2024-01-30',
    },
  },
};

export default adapter;
