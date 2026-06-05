import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.10kswap.com/analytics"

interface IVolumeall {
  volume: string;
  date: string;
}

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.toTimestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.volumes;

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch,
      start: '2022-09-19'
    },
  },
};

export default adapter;
