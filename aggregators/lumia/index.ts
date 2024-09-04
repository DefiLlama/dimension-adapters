import fetchURL from "../../utils/fetchURL";
import {FetchOptions, FetchResult, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";

const chains: Record<string, string> = {
    [CHAIN.ETHEREUM]: 'ethereum',
    [CHAIN.BSC]: 'binance-smart-chain',
    [CHAIN.POLYGON]: 'polygon',
    [CHAIN.ARBITRUM]: 'arbitrum',
    [CHAIN.OP_BNB]: 'opbnb',
    [CHAIN.LINEA]: 'linea'
};

interface ApiResponse {
  daily_volume_in_usd: string;
  daily_transaction_count: string;
  total_volume_in_usd: string;
  total_transaction_count: string;
}

const fetch = (chain: string) => async (options: FetchOptions): Promise<FetchResult> => {
  const response: ApiResponse = (
    await fetchURL(`https://trade.orion.xyz/frontage/api/v1/statistics/defilama?date=${options.startTimestamp}&network=${chain}`)
  );

  return {
    dailyVolume: response?.daily_volume_in_usd || '0',
    totalVolume: response?.total_volume_in_usd || '0',
    timestamp: options.startTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    ...Object.entries(chains).reduce((acc, chain) => {
      const [key, value] = chain;

      return {
        ...acc,
        [key]: {
          fetch: fetch(value),
          start: 1672531200, // 01.01.2023
        },
      };
    }, {}),
  },
  version: 2
};

export default adapter;
