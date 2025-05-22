import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { FetchResult, SimpleAdapter, ChainBlocks } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill, { IGraphs } from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const poolsDataEndpoint = "https://api.frax.finance/v2/fraxswap/history?range=all"

type TChains = {
  [chain: string | Chain]: string;
}
const chains: TChains = {
  [CHAIN.ARBITRUM]: 'Arbitrum',
  [CHAIN.AURORA]: 'Aurora',
  [CHAIN.AVAX]: 'Avalanche',
  [CHAIN.BOBA]: 'Boba',
  [CHAIN.BSC]: 'BSC',
  [CHAIN.ETHEREUM]: 'Ethereum',
  [CHAIN.FANTOM]: 'Fantom',
  [CHAIN.HARMONY]: 'Harmony',
  [CHAIN.MOONBEAM]: 'Moonbeam',
  [CHAIN.MOONRIVER]: 'Moonriver',
  [CHAIN.POLYGON]: 'Polygon',
  [CHAIN.FRAXTAL]: 'Fraxtal',
};

interface IVolumeall {
  chain: string;
  swapVolumeUsdAmount: number;
  intervalTimestamp: number;
}

const graphs = (chain: Chain) => {
  return async (timestamp: number, _chainBlocks: ChainBlocks): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical: IVolumeall[] = (await fetchURL(poolsDataEndpoint)).items;
    const historicalVolume = historical
      .filter(e => e.chain.toLowerCase() === chains[chain].toLowerCase());

    const totalVolume = historicalVolume
      .filter(volItem => (new Date(volItem.intervalTimestamp).getTime() / 1000) <= dayTimestamp)
      .reduce((acc, { swapVolumeUsdAmount }) => acc + Number(swapVolumeUsdAmount), 0)
    const dailyVolume = historicalVolume
      .find(dayItem => (new Date(dayItem.intervalTimestamp).getTime() / 1000) === dayTimestamp)?.swapVolumeUsdAmount

    return {
      totalVolume: totalVolume,
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
  }
};

const getStartTimestamp = async (chain: Chain) => {
  const historical: IVolumeall[] = (await fetchURL(poolsDataEndpoint)).items;
  const historicalVolume = historical.filter(e => e.chain.toLowerCase() === chains[chain].toLowerCase());
  return (new Date(historicalVolume[historicalVolume.length - 1].intervalTimestamp).getTime()) / 1000
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(chains).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        // start: async () => getStartTimestamp(chain),
        customBackfill: customBackfill(chain as Chain, graphs as unknown as IGraphs),
      }
    }
  }, {})
};

export default adapter;
