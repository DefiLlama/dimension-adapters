import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Maps DefiLlama chain identifiers to DropSwap's internal chain keys (used by its API)
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

// DropSwap's own public API, aggregating swap volume from its backend database, grouped by day and chain
// https://dropswap.finance/api/defillama/volume-by-chain
const API_URL = "https://dropswap.finance/api/defillama/volume-by-chain";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const data: IVolumeByChainRecord[] = await fetchURL(API_URL);
  const dayRecord = data.find((d) => d.date === options.dateString);
  const chainKey = chains[options.chain];
  const chainData = dayRecord?.chains?.[chainKey];

  return {
    dailyVolume: (chainData?.volume ?? 0).toString(),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: Object.keys(chains),
  fetch,
  start: '2026-06-11',
  methodology: {
    Volume: "Daily swap volume is the sum of USD value of all successful swaps routed through DropSwap's backend (via LI.FI and Odos), recorded per chain in DropSwap's own database.",
  },
};

export default adapter;
