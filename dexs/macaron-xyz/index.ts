import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";

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
    const totalVolume = historicalVolume
      .filter(volItem => getUniqStartOfTodayTimestamp(new Date(volItem.statistics_date)) <= dayTimestamp)
      .reduce((acc, { volume }) => acc + Number(volume), 0)
    const dailyVolume = historicalVolume
      .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.statistics_date)) === dayTimestamp)?.volume
    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  };
}

const getStartTimestamp = async (chain: Chain) => {
  // const queryByChainId = `?chain_id=${mapChainId[chain]}`;
  const historicalVolume: IVolume[] = (await fetchURL(`${historicalVolumeEndpoint}/${mapChainId[chain]}/volume`)).data;
  return (new Date(historicalVolume[0].statistics_date).getTime()) / 1000
}
const adapter: SimpleAdapter = {
  version: 2,
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
