import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
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
const fetch = async ({ chain, startOfDay }: FetchOptions) => {
    const historicalVolume: IVolume[] = (await fetchURL(`${historicalVolumeEndpoint}/${mapChainId[chain]}/volume`)).data;
    const dailyVolume = historicalVolume
      .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.statistics_date)) === startOfDay)?.volume
    return {
      dailyVolume: dailyVolume,
    };
  };

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(mapChainId) as Chain[],
};

export default adapter;
