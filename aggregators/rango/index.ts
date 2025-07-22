import { Adapter, FetchOptions } from '../../adapters/types';
import { httpGet } from '../../utils/fetchURL';
import { CHAIN } from '../../helpers/chains';

const RangoChains: Record<string, string> = {
  [CHAIN.ETHEREUM]: 'ETH',
  [CHAIN.SOLANA]: 'SOLANA',
  [CHAIN.BSC]: 'BSC',
  [CHAIN.SCROLL]: 'SCROLL',
  [CHAIN.BASE]: 'BASE',
  [CHAIN.BITCOIN]: 'BTC',
  [CHAIN.ARBITRUM]: 'ARBITRUM',
  [CHAIN.POLYGON]: 'POLYGON',
  [CHAIN.OPTIMISM]: 'OPTIMISM',
  [CHAIN.LINEA]: 'LINEA',
  [CHAIN.CELO]: 'CELO',
  [CHAIN.AVAX]: 'AVAX_CCHAIN',
  [CHAIN.ERA]: 'ZKSYNC',
  [CHAIN.MODE]: 'MODE',
  [CHAIN.TRON]: 'TRON',
  [CHAIN.ZORA]: 'ZORA',
  [CHAIN.BLAST]: 'BLAST',
  [CHAIN.OSMOSIS]: 'OSMOSIS',
  [CHAIN.COSMOS]: 'COSMOS',
  [CHAIN.FANTOM]: 'FANTOM',
  [CHAIN.MOONRIVER]: 'MOONRIVER',
  [CHAIN.TAIKO]: 'TAIKO',
  [CHAIN.STARKNET]: 'STARKNET',
  [CHAIN.POLYGON_ZKEVM]: 'POLYGONZK',
  [CHAIN.SUI]: 'SUI',
  [CHAIN.CRONOS]: 'CRONOS',
  [CHAIN.NOBLE]: 'NOBLE',
  [CHAIN.BOBA]: 'BOBA',
  [CHAIN.THORCHAIN]: 'THOR',
  [CHAIN.FUSE]: 'FUSE',
  [CHAIN.XDAI]: 'GNOSIS',
  [CHAIN.HARMONY]: 'HARMONY',
  [CHAIN.MOONBEAM]: 'MOONBEAM',
  [CHAIN.TERRA]: 'TERRA',
  [CHAIN.SONIC]: 'SONIC',
  [CHAIN.TON]: 'TON',
  [CHAIN.BERACHAIN]: 'BERACHAIN',
  [CHAIN.AURORA]: 'AURORA',
};

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const prefetchData = options.preFetchedResults as Record<string, any[]>;
  const chainCode = RangoChains[options.chain];
  const statsForChain = prefetchData[chainCode] || [];

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
  const DAYS = 10000
  const BREAKDOWN = 'SOURCE'

  // fire off one request per chain
  const entries = await Promise.all(
    Object.values(RangoChains).map(chainCode =>
      httpGet(
        `https://api.rango.exchange/scanner/summary/daily` +
        `?days=${DAYS}` +
        `&breakDownBy=${BREAKDOWN}` +
        `&apiKey=${API_KEY}` +
        `&source=${chainCode}` +
        `&destination=${chainCode}`
      ).then(response => [chainCode, response.stats])
    )
  );

  return Object.fromEntries(entries);
}


const chainAdapter = { fetch, start: '2021-08-04' }

const adapter: Adapter = {
  adapter: Object.fromEntries(Object.entries(RangoChains).map(
    ([chain]) => [chain, chainAdapter]
  )),
  prefetch: prefetch,
}

export default adapter;
