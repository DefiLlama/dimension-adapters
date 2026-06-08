import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "../../adapters/types";

const historicalVolumeEndpoint = "https://info.mdex.one/pair/volume/statistics/max"

interface IVolume {
  swap_count: string;
  created_time: string;
  max_swap_amount: string;
}
type ChainMapId = {
  [chain: string | Chain]: number;
}
const mapChainId: ChainMapId = {
  [CHAIN.BSC]: 56,
  [CHAIN.HECO]: 128,
  [CHAIN.BITTORRENT]: 199
};
const fetch = async (options: FetchOptions) => {
    if (options.chain === CHAIN.HECO) { return {}} // skip HECO for now
    const queryByChainId = `?chain_id=${mapChainId[options.chain]}`;
    const historicalVolume: IVolume[] = (await fetchURL(`${historicalVolumeEndpoint}${queryByChainId}`)).result;
    const dailyVolume = historicalVolume
      .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.created_time)) === options.startOfDay)?.max_swap_amount

    return {
      dailyVolume: dailyVolume,
    };
  };

const adapter: SimpleAdapter = {
  adapter: Object.keys(mapChainId).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch,
      }
    }
  }, {})
};

export default adapter;
