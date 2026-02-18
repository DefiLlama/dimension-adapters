import fetchURL from "../../utils/fetchURL";
import {FetchOptions, FetchResult, SimpleAdapter} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const data: ApiResponse = await fetchURL(`https://trade.orion.xyz/frontage/api/v1/statistics/defilama?date=${options.startTimestamp}&network=${chains[options.chain]}`);

  return {
    dailyVolume: data?.daily_volume_in_usd || '0',
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: '2025-07-16', // webapp down, X account suspended
  adapter: {
    ...Object.entries(chains).reduce((acc, [key]) => {
      return {
        ...acc,
        [key]: { 
          fetch,
          start: '2023-01-01',
        },
      };
    }, {}),
  },
};

export default adapter;
