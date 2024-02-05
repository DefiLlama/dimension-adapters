import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import type { ChainEndpoints } from "../adapters/types"
import fetchURL from "../utils/fetchURL";
import { Adapter } from "../adapters/types";
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
      const historical: IHistory[] = (await fetchURL(poolsDataEndpoint)).items;
      const historicalVolume = historical
        .filter(e => e.chain.toLowerCase() === chains[chain].toLowerCase());

      const totalFees = historicalVolume
        .filter(volItem => (new Date(volItem.intervalTimestamp).getTime() / 1000) <= dayTimestamp)
        .reduce((acc, { feeUsdAmount }) => acc + Number(feeUsdAmount), 0)
      const dailyFees = historicalVolume
        .find(dayItem => (new Date(dayItem.intervalTimestamp).getTime() / 1000) === dayTimestamp)?.feeUsdAmount
      return {
        timestamp,
        dailyUserFees: dailyFees?.toString(),
        totalFees: totalFees.toString(),
        totalUserFees: totalFees.toString(),
        dailyFees: dailyFees?.toString(),
        totalRevenue: "0",
        dailyRevenue: "0",
      };
    };
  };
};

const getStartTimestamp = async (chain: Chain) => {
  const historical: IHistory[] = (await fetchURL(poolsDataEndpoint)).items;
  const historicalVolume = historical.filter(e => e.chain.toLowerCase() === chains[chain].toLowerCase());
  return (new Date(historicalVolume[historicalVolume.length - 1].intervalTimestamp).getTime()) / 1000
}

const methodology = {
  UserFees: "Users pay 0.3% swap fees",
  Fees: "A 0.3% fee is collected from each swap"
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs()(CHAIN.ARBITRUM),
      start: async () => getStartTimestamp(CHAIN.ARBITRUM),
      meta: {
        methodology
      }
    },
    [CHAIN.AURORA]: {
      fetch: graphs()(CHAIN.AURORA),
      start: async () => getStartTimestamp(CHAIN.AURORA),
      meta: {
        methodology
      }
    },
    [CHAIN.AVAX]: {
      fetch: graphs()(CHAIN.AVAX),
      start: async () => getStartTimestamp(CHAIN.AVAX),
      meta: {
        methodology
      }
    },
    [CHAIN.BOBA]: {
      fetch: graphs()(CHAIN.BOBA),
      start: async () => getStartTimestamp(CHAIN.BOBA),
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch: graphs()(CHAIN.BSC),
      start: async () => getStartTimestamp(CHAIN.BSC),
      meta: {
        methodology
      }
    },
    [CHAIN.ETHEREUM]: {
      fetch: graphs()(CHAIN.ETHEREUM),
      start: async () => getStartTimestamp(CHAIN.ETHEREUM),
      meta: {
        methodology
      }
    },
    [CHAIN.FANTOM]: {
      fetch: graphs()(CHAIN.FANTOM),
      start: async () => getStartTimestamp(CHAIN.FANTOM),
      meta: {
        methodology
      }
    },
    [CHAIN.HARMONY]: {
      fetch: graphs()(CHAIN.HARMONY),
      start: async () => getStartTimestamp(CHAIN.HARMONY),
      meta: {
        methodology
      }
    },
    [CHAIN.MOONBEAN]: {
      fetch: graphs()(CHAIN.MOONBEAN),
      start: async () => getStartTimestamp(CHAIN.MOONBEAN),
      meta: {
        methodology
      }
    },
    [CHAIN.MOONRIVER]: {
      fetch: graphs()(CHAIN.MOONRIVER),
      start: async () => getStartTimestamp(CHAIN.MOONRIVER),
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch: graphs()(CHAIN.POLYGON),
      start: async () => getStartTimestamp(CHAIN.POLYGON),
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
