import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
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
    case CHAIN.MONAD:
      return 'monad';
    case CHAIN.HYPERLIQUID:
      return 'hyperevm';
    case CHAIN.SUI:
      return 'sui';
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

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const response: ApiResponse = await fetchCacheURL('https://explorer-api.mayan.finance/v3/stats/chains-overview?timeRange=24h');

  const chainKey = getChainKey(options.chain);
  const volume = fetchChainVolume(response, chainKey);
  const dailyFees = volume * FEE_RATE;

  return {
    dailyFees,
    dailyRevenue: dailyFees
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
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.AVAX, CHAIN.BSC, CHAIN.POLYGON, CHAIN.SOLANA, CHAIN.BASE, CHAIN.OPTIMISM, CHAIN.MONAD, CHAIN.HYPERLIQUID, CHAIN.SUI],
};

export default adapter;
