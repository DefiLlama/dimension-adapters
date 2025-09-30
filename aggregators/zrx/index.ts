import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { getEnv } from "../../helpers/env";
import axios from "axios";

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
  [CHAIN.BLAST]: 81457,
  [CHAIN.LINEA]: 59144,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.MANTLE]: 5000,
  [CHAIN.MODE]: 34443,
  [CHAIN.BERACHAIN]: 80094,
  [CHAIN.INK]: 57073,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.WC]: 480,
  [CHAIN.PLASMA]: 9745,
};

const fetch = async (_a, _b, options: FetchOptions) => {
  const data = await axios.get(`https://api.0x.org/stats/volume/daily?timestamp=${options.startOfDay}&chainId=${CHAINS[options.chain]}`, {
    headers: {
      "0x-api-key": getEnv("AGGREGATOR_0X_API_KEY")
    }
  })
  return {
    dailyVolume: data.data.data.volume
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
