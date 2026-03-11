import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import fetchURL from "../utils/fetchURL";

interface ChainData {
  outFlow: Array<{ chain: string; volume: number }>;
  inFlow: Array<{ chain: string; volume: number }>;
}

interface ApiResponse {
  [chain: string]: ChainData;
}

const FEE_RATE = 0.001; // 0.1% or 10bps

const getChainKey = (chain: string) => {
  switch (chain) {
    case CHAIN.ETHEREUM:
      return 'ethereum';
    case CHAIN.ARBITRUM:
      return 'arbitrum';
    case CHAIN.AVAX:
      return 'avalanche';
    case CHAIN.BSC:
      return 'bsc';
    case CHAIN.POLYGON:
      return 'polygon';
    case CHAIN.SOLANA:
      return 'solana';
    case CHAIN.BASE:
      return 'base';
    case CHAIN.OPTIMISM:
      return 'optimism';
    default:
      return '';
  }
};

const fetchChainVolume = (response: ApiResponse, chainKey: string) => {
  const chainData = response[chainKey];
  if (!chainData) return 0;

  let volume = 0;
  chainData.outFlow.forEach(flow => volume += flow.volume);
  return volume;
};

type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

const fetchCacheURL = (url: string) => {
  const key = url;
  if (!requests[key]) {
    requests[key] = fetchURL(url);
  }
  return requests[key];
}

const fetch = (chain: string) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const response: ApiResponse = await fetchCacheURL('https://explorer-api.mayan.finance/v3/stats/chains-overview?timeRange=24h');

    const chainKey = getChainKey(chain);
    const volume = fetchChainVolume(response, chainKey);
    const dailyFees = volume * FEE_RATE;

    return {
      timestamp: dayTimestamp,
      dailyFees,
      dailyRevenue: dailyFees
    };
  };
};

const methodology: any = {
    Fees: 'Fees are 10 basis points (0.1%) of the outbound bridge volume through Mayan WH Swap on each chain. Only source chain transactions pay fees.',
    Revenue: 'Fees are 10 basis points (0.1%) of the outbound bridge volume through Mayan WH Swap on each chain. Only source chain transactions pay fees.',
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  runAtCurrTime: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
    },
    [CHAIN.SOLANA]: {
      fetch: fetch(CHAIN.SOLANA),
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
    },
  },
};

export default adapter;
