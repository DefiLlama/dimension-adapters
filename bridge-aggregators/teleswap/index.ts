import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { httpGet } from '../../utils/fetchURL';
import { CHAIN } from '../../helpers/chains';
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume';

const chains: Record<string, string> = {
  [CHAIN.BITCOIN]: 'bitcoin',
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.SUI]: 'sui',
  [CHAIN.TRON]: 'tron',
  [CHAIN.BASE]: 'base',
  // [CHAIN.BSC]: 'bsc',
  [CHAIN.TARA]: 'tara',
  [CHAIN.AVAX]: 'avax',
  [CHAIN.LITECOIN]: 'litecoin',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.NEAR]: 'near',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.TON]: 'ton',
  [CHAIN.SOLANA]: 'solana',
};

const fetchVolume = async (_t: any, _b: any, options: FetchOptions) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(
    new Date(options.startOfDay * 1000)
  );

  const response = await httpGet('https://api.teleswap.io/stats/volume', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const chainVolume = response?.find(
    (item: any) =>
      item.chain.toLowerCase() === chains[options.chain].toLowerCase()
  );

  return {
    dailyBridgeVolume: chainVolume?.dailyVolume || 0,
    totalBridgeVolume: chainVolume?.totalVolume || 0,
    timestamp: unixTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    ...Object.entries(chains).reduce((acc, chain) => {
      const [key, value] = chain;

      return {
        ...acc,
        [key]: {
          fetch: fetchVolume,
          start: '2024-09-18',
        },
      };
    }, {}),
  },
  version: 1,
};

export default adapter;
