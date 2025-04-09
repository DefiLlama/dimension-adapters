import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";



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
    [CHAIN.MERLIN]: 'merlin',
    [CHAIN.CORE]: 'core',
    [CHAIN.TAIKO]: 'taiko',
    [CHAIN.ZKLINK]: 'zklink',
    [CHAIN.BITLAYER]: 'bitlayer',
    [CHAIN.BITCOIN]: 'bitcoin',
    [CHAIN.BERACHAIN]: 'berachain',
    [CHAIN.APTOS]: 'aptos',
    [CHAIN.ALGORAND]: 'algorand',
    [CHAIN.ASTAR]: 'astar',
    [CHAIN.CARDANO]: 'cardano',
    // [CHAIN.ASTAR_ZKEVM]: 'astar-evm',
    [CHAIN.BOBA_BNB]:'boba-bsc',
    [CHAIN.EOS]: 'eos',
    [CHAIN.DOGECHAIN]: 'dogecoin',
    [CHAIN.FILECOIN]: 'filecoin',
    [CHAIN.FLOW]: 'flow',
    [CHAIN.HEDERA]: 'hedera', 
    [CHAIN.ICP]: 'icp',
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
    [CHAIN.EON]: 'horizen-eon',
    [CHAIN.BAHAMUT]: 'bahamut',
    [CHAIN.KLAYTN]: 'klaytn',
    [CHAIN.VELAS]: 'velas',
    [CHAIN.SYSCOIN]: 'syscoin',
    [CHAIN.FLARE]: 'flare',
    [CHAIN.TON]: 'ton',
    [CHAIN.COSMOS]: 'cosmos',
    [CHAIN.LITECOIN]: 'litecoin',
    [CHAIN.OSMOSIS]: 'osmosis',
    [CHAIN.RIPPLE]: 'ripple',
    [CHAIN.POLKADEX]: 'polkadot',
    [CHAIN.STELLAR]: 'stellar',
    [CHAIN.NEAR]: 'near',
    [CHAIN.TEZOS]: 'tezos',
    [CHAIN.WAVES]: 'waves',
    [CHAIN.WAX]: 'wax',
    [CHAIN.XDC]: 'xdc',
    [CHAIN.NEO]: 'neo'
  };
  
  interface ApiResponse {
    daily_volume_in_usd: string;
    daily_transaction_count: string;
    total_volume_in_usd: string;
    total_transaction_count: string;
  }
  
  const fetch = (chain: string) => async (options: FetchOptions): Promise<FetchResult> => {
    const response: ApiResponse = (
      await fetchURL(`https://api.rubic.exchange/api/stats/defilama_crosschain?date=${options.startTimestamp}&network=${chain}`)
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
            start: '2023-01-01', // 01.01.2023
          },
        };
      }, {}),
    },
    version: 2
  };
  
  export default adapter;
  