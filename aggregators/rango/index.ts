import { Adapter, FetchOptions } from '../../adapters/types';
import { httpGet } from '../../utils/fetchURL';
import { CHAIN } from '../../helpers/chains';

type ChainInfo = { code: string; start: string };
const DEFAULT_START = '2021-08-01'

const RangoChains: Record<string, ChainInfo> = {
  [CHAIN.ETHEREUM]: { code: 'ETH', start: '2021-08-01' },
  [CHAIN.SOLANA]: { code: 'SOLANA', start: '2022-04-01' },
  [CHAIN.BSC]: { code: 'BSC', start: '2021-08-01' },
  [CHAIN.SCROLL]: { code: 'SCROLL', start: '2024-01-01' },
  [CHAIN.BASE]: { code: 'BASE', start: '2023-11-01' },
  [CHAIN.BITCOIN]: { code: 'BTC', start: '2021-09-01' },
  [CHAIN.ARBITRUM]: { code: 'ARBITRUM', start: '2022-01-01' },
  [CHAIN.POLYGON]: { code: 'POLYGON', start: '2021-08-01' },
  [CHAIN.OPTIMISM]: { code: 'OPTIMISM', start: '2022-04-01' },
  [CHAIN.LINEA]: { code: 'LINEA', start: '2023-07-01' },
  [CHAIN.CELO]: { code: 'CELO', start: '2024-04-01' },
  [CHAIN.AVAX]: { code: 'AVAX_CCHAIN', start: '2021-09-01' },
  [CHAIN.ERA]: { code: 'ZKSYNC', start: '2023-04-01' },
  [CHAIN.MODE]: { code: 'MODE', start: '2024-06-01' },
  [CHAIN.TRON]: { code: 'TRON', start: '2023-02-01' },
  [CHAIN.ZORA]: { code: 'ZORA', start: '2024-12-01' },
  [CHAIN.BLAST]: { code: 'BLAST', start: '2024-04-01' },
  [CHAIN.OSMOSIS]: { code: 'OSMOSIS', start: '2021-08-01' },
  [CHAIN.COSMOS]: { code: 'COSMOS', start: '2021-08-01' },
  [CHAIN.FANTOM]: { code: 'FANTOM', start: '2021-11-01' },
  [CHAIN.MOONRIVER]: { code: 'MOONRIVER', start: '2022-05-01' },
  [CHAIN.TAIKO]: { code: 'TAIKO', start: '2024-12-01' },
  [CHAIN.STARKNET]: { code: 'STARKNET', start: '2023-02-01' },
  [CHAIN.POLYGON_ZKEVM]: { code: 'POLYGONZK', start: '2023-06-01' },
  [CHAIN.SUI]: { code: 'SUI', start: '2025-04-01' },
  [CHAIN.CRONOS]: { code: 'CRONOS', start: '2022-05-01' },
  [CHAIN.NOBLE]: { code: 'NOBLE', start: '2023-09-01' },
  [CHAIN.BOBA]: { code: 'BOBA', start: '2022-06-01' },
  [CHAIN.THORCHAIN]: { code: 'THOR', start: '2021-08-01' },
  [CHAIN.FUSE]: { code: 'FUSE', start: '2022-04-01' },
  [CHAIN.XDAI]: { code: 'GNOSIS', start: '2022-06-01' },
  [CHAIN.HARMONY]: { code: 'HARMONY', start: '2021-09-01' },
  [CHAIN.MOONBEAM]: { code: 'MOONBEAM', start: '2022-06-01' },
  [CHAIN.TERRA]: { code: 'TERRA', start: '2021-08-01' },
  [CHAIN.SONIC]: { code: 'SONIC', start: '2025-04-01' },
  [CHAIN.TON]: { code: 'TON', start: '2024-11-01' },
  [CHAIN.BERACHAIN]: { code: 'BERACHAIN', start: '2025-04-01' },
  [CHAIN.AURORA]: { code: 'AURORA', start: '2022-08-01' },
  [CHAIN.RIPPLE]: { code: 'XRPL', start: '2025-09-01' },
  [CHAIN.HYPERLIQUID]: { code: 'HYPERLIQUID', start: '2025-10-01' },
  [CHAIN.MONAD]: { code: 'MONAD', start: '2025-11-01' },
  [CHAIN.UNICHAIN]: { code: 'UNICHAIN', start: '2025-08-01' },
  [CHAIN.SONEIUM]: { code: 'SONEIUM', start: '2025-09-01' },
  [CHAIN.KATANA]: { code: 'KATANA', start: '2025-11-01' },
  [CHAIN.PLASMA]: { code: 'PLASMA', start: '2025-12-01' }
};

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const prefetchData = options.preFetchedResults as Record<string, any[]>;
  const chainInfo = RangoChains[options.chain];
  const statsForChain = prefetchData[chainInfo.code] || [];

  const date = new Date(timestamp * 1000).toISOString().split('T')[0];
  
  const statEntry = statsForChain.find(item => {
    const itemDate = item.date.split('T')[0];
    return itemDate === date;
  });

  return {
    dailyVolume: Number(statEntry?.volume || 0)
  }
}

const prefetch = async (_: FetchOptions) => {
  const API_KEY = '4a624ab5-16ff-4f96-90b7-ab00ddfc342c'
  const BREAKDOWN = 'SOURCE'

  const fromTs = new Date(`${DEFAULT_START}T00:00:00Z`).getTime();

  const url = `https://api.rango.exchange/scanner/summary/daily` +
    `?from=${fromTs}` +
    `&to=${Date.now()}` +
    `&breakDownBy=${BREAKDOWN}` +
    `&apiKey=${API_KEY}` +
    `&txType=DEX`;

  const response = await httpGet(url);
  const resultsByChain: Record<string, any> = {};

  for (const stat of response.stats) {
    const bucket = stat.bucket;
    if (!resultsByChain[bucket]) {
      resultsByChain[bucket] = [];
    }
    resultsByChain[bucket].push(stat);
  }

  return resultsByChain;
}

const adapter: Adapter = {
  adapter: Object.fromEntries(
    Object.keys(RangoChains).map(chain => {
      const start = RangoChains[chain].start || DEFAULT_START;
      return [
        chain,
        { fetch, start }
      ];
    })
  ),
  prefetch: prefetch,
};

export default adapter;
