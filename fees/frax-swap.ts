import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
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

const methodology = {
  UserFees: "Users pay 0.3% swap fees",
  Fees: "A 0.3% fee is collected from each swap"
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs()(CHAIN.ARBITRUM),
      meta: {
        methodology
      }
    },
    [CHAIN.AURORA]: {
      fetch: graphs()(CHAIN.AURORA),
      meta: {
        methodology
      }
    },
    [CHAIN.AVAX]: {
      fetch: graphs()(CHAIN.AVAX),
      meta: {
        methodology
      }
    },
    [CHAIN.BOBA]: {
      fetch: graphs()(CHAIN.BOBA),
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch: graphs()(CHAIN.BSC),
      meta: {
        methodology
      }
    },
    [CHAIN.ETHEREUM]: {
      fetch: graphs()(CHAIN.ETHEREUM),
      meta: {
        methodology
      }
    },
    [CHAIN.FANTOM]: {
      fetch: graphs()(CHAIN.FANTOM),
      meta: {
        methodology
      }
    },
    [CHAIN.HARMONY]: {
      fetch: graphs()(CHAIN.HARMONY),
      meta: {
        methodology
      }
    },
    [CHAIN.MOONBEAN]: {
      fetch: graphs()(CHAIN.MOONBEAN),
      meta: {
        methodology
      }
    },
    [CHAIN.MOONRIVER]: {
      fetch: graphs()(CHAIN.MOONRIVER),
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch: graphs()(CHAIN.POLYGON),
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
