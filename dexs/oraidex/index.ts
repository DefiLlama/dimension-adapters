import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.oraidex.io/v1/pools/"

interface IVolumeall {
  value: number;
  volume24Hour: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const dailyVolume = historicalVolume
    .filter(e => Number(e.volume24Hour)/1e6 < 100_000_000) // prev pool volume spike
    .reduce((acc, { volume24Hour }) => acc + Number(volume24Hour), 0) / 1e6;

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ORAI]: {
      fetch,
      start: '2022-11-24',
    },
  },
};

export default adapter;
