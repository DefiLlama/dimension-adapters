import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import fetchURL from "../../utils/fetchURL"

const endpoints: { [chain: string]: string } = {
  [CHAIN.ETHEREUM]: "https://api.curve.fi/api/getAllPoolsVolume/ethereum",
  [CHAIN.POLYGON]: "https://api.curve.fi/api/getAllPoolsVolume/polygon",
  [CHAIN.FANTOM]: "https://api.curve.fi/api/getAllPoolsVolume/fantom",
  [CHAIN.ARBITRUM]: "https://api.curve.fi/api/getAllPoolsVolume/arbitrum",
  [CHAIN.AVAX]: "https://api.curve.fi/api/getAllPoolsVolume/avalanche",
  [CHAIN.OPTIMISM]: "https://api.curve.fi/api/getAllPoolsVolume/optimism",
  [CHAIN.XDAI]: "https://api.curve.fi/api/getAllPoolsVolume/xdai"
};

interface IAPIResponse {
  success: boolean
  data: {
    totalVolume: number,
    cryptoShare: number,
    generatedTimeMs: number
  }
}

const fetch = (chain: string) => async (timestamp: number) => {
  const response: IAPIResponse = (await fetchURL(endpoints[chain])).data;
  const t = response.data.generatedTimeMs ? response.data.generatedTimeMs / 1000 : timestamp
  return {
    dailyVolume: `${response.data.totalVolume}`,
    timestamp: t,
  };
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain),
        start: async () => 0,
        runAtCurrTime: true
      }
    }
  }, {})
};
export default adapter;
