import fetchURL from "../../utils/fetchURL";
import {FetchOptions, FetchResult, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";


const chains: Record<string, string> = {
  [CHAIN.SOLANA]: 'solana',
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.BSC]: 'binance-smart-chain',
  [CHAIN.AVAX]: 'avalanche',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.ZKSYNC]: 'zksync',
  [CHAIN.BLAST]: 'blast',
  [CHAIN.LINEA]: 'linea',
  [CHAIN.SCROLL]: 'scroll',
  [CHAIN.ZETA]: 'zetachain',
  [CHAIN.MANTLE]: 'mantle',
  [CHAIN.MANTA]: 'manta-pacific',
  [CHAIN.POLYGON_ZKEVM]: 'polygon-zkevm',
  [CHAIN.PULSECHAIN]: 'pulsechain',
  [CHAIN.BASE]: 'base',
  [CHAIN.FANTOM]: 'fantom',
  [CHAIN.BOBA]: 'boba',
  [CHAIN.TELOS]: 'telos-evm',
  [CHAIN.KAVA]: 'kava',
  [CHAIN.OPTIMISM]: 'optimistic-ethereum',
  [CHAIN.AURORA]: 'aurora',
  [CHAIN.METIS]: 'metis',
  [CHAIN.MOONRIVER]: 'moonriver',
  [CHAIN.TRON]: 'tron',
  [CHAIN.MOONBEAM]: 'moonbeam',
  [CHAIN.FUSE]: 'fuse',
  [CHAIN.CELO]: 'celo',
  [CHAIN.OKEXCHAIN]: 'oke-x-chain',
  [CHAIN.CRONOS]: 'cronos',
  [CHAIN.MODE]: 'mode',
  [CHAIN.MERLIN]: 'merlin'
};

interface ApiResponce {
  daily_volume_in_usd: string;
  daily_transaction_count: string;
  total_volume_in_usd: string;
  total_transaction_count: string;
}

const fetch = (chain: string) => async (options: FetchOptions): Promise<FetchResult> => {
  const responce: ApiResponce = (
    await fetchURL(`https://api.rubic.exchange/api/stats/defilama_onchain?date=${options.startTimestamp}&network=${chain}`)
  );

  return {
    dailyVolume: responce?.daily_volume_in_usd || '0',
    totalVolume: responce?.total_volume_in_usd || '0',
    timestamp: options.startTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    ...Object.entries(chains).reduce((acc, chain) => {
      const key = chain[0];
      const value = chain[1];

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
