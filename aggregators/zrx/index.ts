import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";

type TChain = {
  [key: string]: number;
};
const CHAINS: TChain = {
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
  [CHAIN.BASE]: 8453,
  [CHAIN.BSC]: 56,
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.POLYGON]: 137,
  // [CHAIN.BLAST]: 81457,
  [CHAIN.LINEA]: 59144,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.MANTLE]: 5000,
  [CHAIN.MODE]: 34443,
  [CHAIN.BERACHAIN]: 80094,
  [CHAIN.INK]: 57073,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.WC]: 480,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.SONIC]: 146,
  [CHAIN.MONAD]: 143,
  [CHAIN.HYPERLIQUID]: 999,
  [CHAIN.ABSTRACT]: 2741,
  [CHAIN.TEMPO]: 4217,
};

const inflatedFees: Record<string, Array<string>> = {
  [CHAIN.ETHEREUM]: ["2026-03-02", "2026-03-22"]
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const response= await httpGet(`https://api.0x.org/stats/volume/daily?timestamp=${options.startOfDay}&chainId=${CHAINS[options.chain]}`, {
    headers: {
      "0x-api-key": getEnv("AGGREGATOR_0X_API_KEY")
    }
  })

  let dailyVolume = 0;

  if (!inflatedFees[options.chain] || !inflatedFees[options.chain].includes(options.dateString))
    dailyVolume = response.data.volume;

  return {
    dailyVolume,
  }
};

const adapter: any = {
  version: 1,
  adapter: Object.keys(CHAINS).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch,
        start: '2022-05-17',
      },
    };
  }, {}),
};

export default adapter;
