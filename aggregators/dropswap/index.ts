import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chains: Record<string, string> = {
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.BASE]: 'base',
  [CHAIN.BSC]: 'bsc',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.AVAX]: 'avalanche',
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.UNICHAIN]: 'unichain',
  [CHAIN.HYPERLIQUID]: 'hyperevm',
  [CHAIN.SEI]: 'sei',
  [CHAIN.BERACHAIN]: 'berachain',
  [CHAIN.MONAD]: 'monad',
  [CHAIN.ROBINHOOD]: 'robinhood',
  [CHAIN.PLASMA]: 'plasma',
  [CHAIN.LINEA]: 'linea',
  [CHAIN.SCROLL]: 'scroll',
  [CHAIN.BLAST]: 'blast',
  [CHAIN.MANTLE]: 'mantle',
  [CHAIN.XDAI]: 'gnosis',
  [CHAIN.SONEIUM]: 'soneium',
};

interface IVolumeByChainRecord {
  date: string;
  timestamp: number;
  chains: Record<string, { volume: number; transactions: number }>;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const data: IVolumeByChainRecord[] = await fetchURL("https://dropswap.finance/api/defillama/volume-by-chain");
  const dateStr = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const dayRecord = data.find((d) => d.date === dateStr);
  const chainKey = chains[options.chain];
  const chainData = dayRecord?.chains?.[chainKey];

  return {
    dailyVolume: (chainData?.volume ?? 0).toString(),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    ...Object.entries(chains).reduce((acc, [key]) => {
      return {
        ...acc,
        [key]: {
          fetch,
          start: '2026-06-11',
        },
      };
    }, {}),
  },
};

export default adapter;
