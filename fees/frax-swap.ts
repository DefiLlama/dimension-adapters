import { CHAIN } from "../helpers/chains";
import { FetchOptions, Adapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphFees";

const poolsDataEndpoint = "https://api.frax.finance/v2/fraxswap/history?range=all"

const chains: Record<string, string> = {
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
};

interface IHistory {
  chain: string;
  feeUsdAmount: number;
  intervalTimestamp: number;
}

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const chain = chains[options.chain];
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historical: IHistory[] = (await fetchURL(poolsDataEndpoint)).items;
  const historicalVolume = historical
    .filter(e => e.chain.toLowerCase() === chain.toLowerCase());
  const dailyFees = historicalVolume
    .find(dayItem => (new Date(dayItem.intervalTimestamp).getTime() / 1000) === dayTimestamp)?.feeUsdAmount

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: "0",
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
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.AURORA]: {
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.AVAX]: {
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.BOBA]: {
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.FANTOM]: {
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.HARMONY]: {
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.MOONBEAM]: {
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.MOONRIVER]: {
      fetch,
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch,
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
