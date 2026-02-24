import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "../../adapters/types";

const historicalVolumeEndpoint = "https://info-api.macaron.xyz/pair/"

interface IVolume {
  count: string;
  statistics_date: string;
  volume: string;
}
type ChainMapId = {
  [chain: string | Chain]: number;
}
const mapChainId: ChainMapId = {
  [CHAIN.BITLAYER]: 200901
};
const fetch = (chain: Chain) => {
  return async (timestamp: any) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp.toTimestamp * 1000));
    const historicalVolume: IVolume[] = (await fetchURL(`${historicalVolumeEndpoint}/${mapChainId[chain]}/volume`)).data;
    const dailyVolume = historicalVolume
      .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.statistics_date)) === dayTimestamp)?.volume
    return {
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(mapChainId).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain as Chain),
      }
    }
  }, {})
};

export default adapter;
