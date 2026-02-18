import { Chain } from "../../adapters/types";
import { FetchResult, SimpleAdapter, ChainBlocks } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

type TEndoint = {
  [chain: string | Chain]: string;
};

const endpoints: TEndoint = {
  // [CHAIN.BSC]: "http://public.tdex.cz/get_volumes_list?chain_id=56",
  // [CHAIN.HECO]: "http://public.tdex.cz/get_volumes_list?chain_id=128",
  [CHAIN.POLYGON]: "http://public.tdex.cz/get_volumes_list?chain_id=137",
};

interface IVolumeall {
  date: string;
  volume: number;
}

const graphs = (chain: Chain) => {
  return async (timestamp: number, _chainBlocks: ChainBlocks): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    if(dayTimestamp > 1735516800) return {}
    const historicalVolume: IVolumeall[] = (await fetchURL(endpoints[chain])).result;
    const dailyVolume = historicalVolume
      .find(dayItem => (new Date(dayItem.date).getTime() / 1000) === dayTimestamp)?.volume

    return {
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
  }
};

const adapter: SimpleAdapter = {
  deadFrom: "2024-12-30",
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
      }
    }
  }, {} as SimpleAdapter['adapter'])
};

export default adapter;
