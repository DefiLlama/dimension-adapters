import { FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

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

const fetch = (chain: string) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const response: ApiResponse = await fetchURL('https://explorer-api.mayan.finance/v3/stats/chains-overview?timeRange=24h');

    const chainKey = getChainKey(chain);
    const volume = fetchChainVolume(response, chainKey);
    const dailyFees = volume * FEE_RATE;

    return {
      timestamp: dayTimestamp,
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyFees.toString()
    };
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: { 
      fetch: fetch(CHAIN.ETHEREUM), 
      runAtCurrTime: true,
      meta: {
        methodology: "Fees are 10 basis points (0.1%) of the outbound bridge volume through Mayan WH Swap on Ethereum. Only source chain transactions pay fees."
      }
    },
    [CHAIN.ARBITRUM]: { 
      fetch: fetch(CHAIN.ARBITRUM), 
      runAtCurrTime: true,
      meta: {
        methodology: "Fees are 10 basis points (0.1%) of the outbound bridge volume through Mayan WH Swap on Arbitrum. Only source chain transactions pay fees."
      }
    },
    [CHAIN.AVAX]: { 
      fetch: fetch(CHAIN.AVAX), 
      runAtCurrTime: true,
      meta: {
        methodology: "Fees are 10 basis points (0.1%) of the outbound bridge volume through Mayan WH Swap on Avalanche. Only source chain transactions pay fees."
      }
    },
    [CHAIN.BSC]: { 
      fetch: fetch(CHAIN.BSC), 
      runAtCurrTime: true,
      meta: {
        methodology: "Fees are 10 basis points (0.1%) of the outbound bridge volume through Mayan WH Swap on BSC. Only source chain transactions pay fees."
      }
    },
    [CHAIN.POLYGON]: { 
      fetch: fetch(CHAIN.POLYGON), 
      runAtCurrTime: true,
      meta: {
        methodology: "Fees are 10 basis points (0.1%) of the outbound bridge volume through Mayan WH Swap on Polygon. Only source chain transactions pay fees."
      }
    },
    [CHAIN.SOLANA]: { 
      fetch: fetch(CHAIN.SOLANA), 
      runAtCurrTime: true,
      meta: {
        methodology: "Fees are 10 basis points (0.1%) of the total volume bridged through Mayan WH Swap on Solana"
      }
    },
    [CHAIN.BASE]: { 
      fetch: fetch(CHAIN.BASE), 
      runAtCurrTime: true,
      meta: {
        methodology: "Fees are 10 basis points (0.1%) of the outbound bridge volume through Mayan WH Swap on Base. Only source chain transactions pay fees."
      }
    },
    [CHAIN.OPTIMISM]: { 
      fetch: fetch(CHAIN.OPTIMISM), 
      runAtCurrTime: true,
      meta: {
        methodology: "Fees are 10 basis points (0.1%) of the outbound bridge volume through Mayan WH Swap on Optimism. Only source chain transactions pay fees."
      }
    },
  },
};

export default adapter;
