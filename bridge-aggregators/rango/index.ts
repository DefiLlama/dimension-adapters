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
  [CHAIN.XRPL]: 'XRPL',
  [CHAIN.HYPERLIQUID]: 'HYPERLIQUID',
  [CHAIN.MONAD]: 'MONAD',
  [CHAIN.UNICHAIN]: 'UNICHAIN',
  [CHAIN.SONEIUM]: 'SONEIUM',
  [CHAIN.KATANA]: 'KATANA',
  [CHAIN.PLASMA]: 'PLASMA'
};

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const prefetchData = options.preFetchedResults

  let dailyVolume = 0

  const date = new Date(timestamp * 1000).toISOString().split('T')[0];
  for (const item of prefetchData) {
    const itemDate = item.date.split('T')[0];
    if (date === itemDate && item.bucket === RangoChains[options.chain]) {
      dailyVolume = Number(item.volume);
    }
  }

  return {
    dailyBridgeVolume: dailyVolume,
  }
}

const prefetch = async (_: FetchOptions) => {
  const data = await httpGet('https://api.rango.exchange/scanner/summary/daily?days=10000&breakDownBy=SOURCE&apiKey=4a624ab5-16ff-4f96-90b7-ab00ddfc342c&txType=BRIDGE');
  return data.stats;
}

const chainAdapter = { fetch, start: '2021-08-04' }

const adapter: Adapter = {
  adapter: Object.fromEntries(Object.entries(RangoChains).map(
    ([chain]) => [chain, chainAdapter]
  )),
  prefetch: prefetch,
}

export default adapter;
