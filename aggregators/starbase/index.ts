import { getEnv } from "../../helpers/env";
import axios from "axios";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

type TChain = {
  [key: string]: number;
};
const CHAINS: TChain = {
  [CHAIN.BASE]: 8453,
};

const fetch = async (_a, _b, options: FetchOptions) => {
  const response = await axios.get(`https://api-analysis-dev.starbase.ag/api/combine/defillama/volume`, {
    headers: {
      "X-BYPASS-KEY": getEnv("STARBASE_API_KEY"),
    }
  })
  const data = response.data;
  const negativeVolume = data.volume24h? - data.volume24h : undefined; 
  return {
    dailyVolume: negativeVolume,
  };
};

const adapter: any = {
  version: 1,
  adapter: Object.keys(CHAINS).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch,
        start: '2025-01-10',
      },
    };
  }, {}),
};

export default adapter;