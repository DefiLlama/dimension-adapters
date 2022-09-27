import { CHAIN } from "@defillama/adapters/volumes/helper/chains";
import { Chain } from "@defillama/sdk/build/general";
import { IGraphUrls } from "../helpers/graphs.type";
import { fetchURL } from "@defillama/adapters/projects/helper/utils";
import { FeeAdapter } from "../utils/adapters.type";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphFees";

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
  [CHAIN.MOONBEAN]: 'Moonbeam',
  [CHAIN.MOONRIVER]: 'Moonriver',
  [CHAIN.POLYGON]: 'Polygon',
};

interface IHistory {
  chain: string;
  feeUsdAmount: number;
  intervalTimestamp: number;
}

const graphs = () => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
      const historical: IHistory[] = (await fetchURL(poolsDataEndpoint))?.data.items;
      const historicalVolume = historical
        .filter(e => e.chain.toLowerCase() === chains[chain].toLowerCase());

      const totalFees = historicalVolume
        .filter(volItem => (new Date(volItem.intervalTimestamp).getTime() / 1000) <= dayTimestamp)
        .reduce((acc, { feeUsdAmount }) => acc + Number(feeUsdAmount), 0)
      const dailyFees = historicalVolume
        .find(dayItem => (new Date(dayItem.intervalTimestamp).getTime() / 1000) === dayTimestamp)?.feeUsdAmount
      return {
        timestamp,
        totalFees: totalFees.toString(),
        dailyFees: dailyFees?.toString(),
        totalRevenue: "0",
        dailyRevenue: "0",
      };
    };
  };
};

const getStartTimestamp = async (chain: Chain) => {
  const historical: IHistory[] = (await fetchURL(poolsDataEndpoint))?.data.items;
  const historicalVolume = historical.filter(e => e.chain.toLowerCase() === chains[chain].toLowerCase());
  return (new Date(historicalVolume[historicalVolume.length - 1].intervalTimestamp).getTime()) / 1000
}
const adapter: FeeAdapter = {
  fees: {
    [CHAIN.ARBITRUM]: {
        fetch: graphs()(CHAIN.ARBITRUM),
        start: async () => getStartTimestamp(CHAIN.ARBITRUM),
    },
    [CHAIN.AURORA]: {
      fetch: graphs()(CHAIN.AURORA),
      start: async () => getStartTimestamp(CHAIN.AURORA),
    },
    [CHAIN.AVAX]: {
      fetch: graphs()(CHAIN.AVAX),
      start: async () => getStartTimestamp(CHAIN.AVAX),
    },
    [CHAIN.BOBA]: {
      fetch: graphs()(CHAIN.BOBA),
      start: async () => getStartTimestamp(CHAIN.BOBA),
    },
    [CHAIN.BSC]: {
      fetch: graphs()(CHAIN.BSC),
      start: async () => getStartTimestamp(CHAIN.BSC),
    },
    [CHAIN.ETHEREUM]: {
      fetch: graphs()(CHAIN.ETHEREUM),
      start: async () => getStartTimestamp(CHAIN.ETHEREUM),
    },
    [CHAIN.FANTOM]: {
      fetch: graphs()(CHAIN.FANTOM),
      start: async () => getStartTimestamp(CHAIN.FANTOM),
    },
    [CHAIN.HARMONY]: {
      fetch: graphs()(CHAIN.HARMONY),
      start: async () => getStartTimestamp(CHAIN.HARMONY),
    },
    [CHAIN.MOONBEAN]: {
      fetch: graphs()(CHAIN.MOONBEAN),
      start: async () => getStartTimestamp(CHAIN.MOONBEAN),
    },
    [CHAIN.MOONRIVER]: {
      fetch: graphs()(CHAIN.MOONRIVER),
      start: async () => getStartTimestamp(CHAIN.MOONRIVER),
    },
    [CHAIN.POLYGON]: {
      fetch: graphs()(CHAIN.POLYGON),
      start: async () => getStartTimestamp(CHAIN.POLYGON),
    },
  }
}

export default adapter;
