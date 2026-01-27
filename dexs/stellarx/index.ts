import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://amm-api.stellarx.com/api/pools/30d-statistic/"

interface IVolumeall {
  volume: number;
  time: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));

  const dailyVolume = historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(Number(`${dayItem.time}`.split('.')[0]) * 1000)) === dayTimestamp)?.volume
  if (!dailyVolume) throw new Error(`No daily volume found for timestamp: ${dayTimestamp}`);

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STELLAR]: {
      fetch,
    },
  },
};

export default adapter;
