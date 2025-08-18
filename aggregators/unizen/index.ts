import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

type TChain = {
  [key: string]: number;
};
const CHAINS: TChain = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.BSC]: 56,
  [CHAIN.POLYGON]: 137,
  [CHAIN.AVAX]: 43114,
  [CHAIN.FANTOM]: 250,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BASE]: 8453,
  [CHAIN.BERACHAIN]: 80094,
  [CHAIN.SONIC]: 146,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.BITCOIN]: 0,
  [CHAIN.BITCOIN_CASH]: 0,
  [CHAIN.LITECOIN]: 0,
  [CHAIN.DOGECHAIN]: 0,
  [CHAIN.COSMOS]: 0,
};

interface VolumeReport {
  volume: number;
  count: number;
  reportByChain: {
    [key: string]: {
      volume: number;
      count: number;
    };
  }
}

function isVolumeReport(data: any): data is VolumeReport {
  return data && typeof data.reportByChain === 'object';
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const chainCode = CHAINS[options.chain];
  if (!chainCode) {
    return {
      dailyVolume: 0,
    };
  }
  const url = `https://api.zcx.com/private/integrators/report/volumeAndCount/24h`;
  const data = (await httpGet(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0+(compatible; unizen; exchange)',
      'Content-Type': 'application/json',
    }
  }));
  if (!isVolumeReport(data)) throw new Error(`Invalid data structure for chain ${chainCode}: ${JSON.stringify(data)}`);
  const chainData = data.reportByChain[chainCode];
  return {
    dailyVolume: chainData?.volume || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    ...Object.keys(CHAINS).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch,
          runAtCurrTime: true,
          start: '2024-10-19',
        },
      };
    }, {}),
  },
};

export default adapter;
