import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

type TChain = {
  [key: string]: number;
};
const CHAINS: TChain = {
  [CHAIN.BASE]: 8453,
};

const fetch = async (_a, _b, options: FetchOptions) => {
  const response = await httpGet(`https://api-analysis.starbase.ag/api/combine/defillama/volume`, {
    headers: {
      "X-External-API-Key": getEnv("STARBASE_API_KEY"),
    }
  })
  const data = response.data;
  const negativeVolume = data.volume24h ? data.volume24h : undefined;
  return {
    dailyVolume: negativeVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  deadFrom: '2025-03-11',
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
