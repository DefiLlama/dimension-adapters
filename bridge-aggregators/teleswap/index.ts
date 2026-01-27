import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { httpGet } from '../../utils/fetchURL';
import { CHAIN } from '../../helpers/chains';

const chains: Record<string, string> = {
  [CHAIN.BITCOIN]: 'bitcoin',
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.SUI]: 'sui',
  [CHAIN.TRON]: 'tron',
  [CHAIN.BASE]: 'base',
  [CHAIN.BSC]: 'bsc',
  [CHAIN.TARA]: 'tara',
  [CHAIN.AVAX]: 'avax',
  [CHAIN.LITECOIN]: 'litecoin',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.NEAR]: 'near',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.TON]: 'ton',
  [CHAIN.SOLANA]: 'solana',
};

let data: any;
const fetch = async (_t: any, _b: any, options: FetchOptions) => {
  if (!data) {
    data = await httpGet('https://api.teleswap.io/stats/volume', {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const chainVolume = data?.find(
    (item: any) =>
      item.chain.toLowerCase() === chains[options.chain].toLowerCase()
  );

  return {
    dailyBridgeVolume: chainVolume?.dailyVolume || 0,
  };
};

const adapter: SimpleAdapter = {
  deadFrom: '2025-04-16',
  adapter: {
    ...Object.entries(chains).reduce((acc, chain) => {
      const [key, value] = chain;

      return {
        ...acc,
        [key]: {
          runAtCurrTime: true,
          fetch,
          start: '2024-09-18',
        },
      };
    }, {}),
  },
  version: 1,
};

export default adapter;
