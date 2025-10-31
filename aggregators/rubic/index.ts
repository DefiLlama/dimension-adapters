import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
  // [CHAIN.OKEXCHAIN]: 'oke-x-chain',
  [CHAIN.CRONOS]: 'cronos',
  [CHAIN.MODE]: 'mode',
  [CHAIN.MERLIN]: 'merlin',
  [CHAIN.CORE]: 'core',
  [CHAIN.TAIKO]: 'taiko',
  [CHAIN.ZKLINK]: 'zklink',
  [CHAIN.BITLAYER]: 'bitlayer',
  [CHAIN.BERACHAIN]: 'berachain',
  [CHAIN.TON]: 'ton',
  [CHAIN.SUI]: 'sui',
  [CHAIN.UNICHAIN]: 'unichain',
  [CHAIN.MORPH]: 'morph',
  [CHAIN.FRAXTAL]: 'fraxtal',
  [CHAIN.SONIC]: 'sonic',
  [CHAIN.SONEIUM]: 'soneium',
  [CHAIN.GRAVITY]: 'gravity',
  [CHAIN.ROOTSTOCK]: 'rootstock',
  [CHAIN.KROMA]: 'kroma',
  [CHAIN.XLAYER]: 'xlayer',
  [CHAIN.SEI]: 'sei',
  // [CHAIN.EON]: 'horizen-eon',   // chain is dead
  [CHAIN.BAHAMUT]: 'bahamut',
  [CHAIN.KLAYTN]: 'klaytn',
  // [CHAIN.ASTAR_ZKEVM]: 'astar-evm',
  [CHAIN.VELAS]: 'velas',
  [CHAIN.SYSCOIN]: 'syscoin',
  [CHAIN.BOBA_BNB]: 'boba-bsc',
  [CHAIN.FLARE]: 'flare',
  [CHAIN.HEMI]: 'hemi'
};

interface ApiResponse {
  daily_volume_in_usd: string;
  daily_transaction_count: string;
  total_volume_in_usd: string;
  total_transaction_count: string;
}

async function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time * 1000))
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  await sleep(Math.floor(Math.random() * 5) + 1)

  const data: ApiResponse = await fetchURL(`https://api.rubic.exchange/api/stats/defilama_onchain?date=${options.startTimestamp}&network=${chains[options.chain]}`);

  return {
    dailyVolume: data?.daily_volume_in_usd || '0',
  };
};

const adapter: SimpleAdapter = {
  version: 2,
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
