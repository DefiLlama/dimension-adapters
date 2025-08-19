import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
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
const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    if (chain === CHAIN.HECO) { return {}} // skip HECO for now
    const queryByChainId = `?chain_id=${mapChainId[chain]}`;
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const historicalVolume: IVolume[] = (await fetchURL(`${historicalVolumeEndpoint}${queryByChainId}`)).result;
    const dailyVolume = historicalVolume
      .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.created_time)) === dayTimestamp)?.max_swap_amount

    return {
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
  };
}

const adapter: SimpleAdapter = {
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
