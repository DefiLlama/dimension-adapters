import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";

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
    const queryByChainId = `?chain_id=${mapChainId[chain]}`;
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const historicalVolume: IVolume[] = (await fetchURL(`${historicalVolumeEndpoint}${queryByChainId}`)).result;
    const totalVolume = historicalVolume
      .filter(volItem => getUniqStartOfTodayTimestamp(new Date(volItem.created_time)) <= dayTimestamp)
      .reduce((acc, { max_swap_amount }) => acc + Number(max_swap_amount), 0)

    const dailyVolume = historicalVolume
      .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.created_time)) === dayTimestamp)?.max_swap_amount

    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  };
}

const getStartTimestamp = async (chain: Chain) => {
  const queryByChainId = `?chain_id=${mapChainId[chain]}`;
  const historicalVolume: IVolume[] = (await fetchURL(`${historicalVolumeEndpoint}${queryByChainId}`)).result;
  return (new Date(historicalVolume[0].created_time).getTime()) / 1000
}
const adapter: SimpleAdapter = {
  adapter: Object.keys(mapChainId).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain as Chain),
        start: async () => getStartTimestamp(chain),
        customBackfill: customBackfill(chain as Chain, fetch),
      }
    }
  }, {})
};

export default adapter;
