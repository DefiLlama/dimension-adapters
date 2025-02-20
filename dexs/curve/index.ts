import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL"

const endpoints: { [chain: string]: string } = {
  [CHAIN.ETHEREUM]: "https://api.curve.fi/api/getSubgraphData/ethereum",
  [CHAIN.POLYGON]: "https://api.curve.fi/api/getSubgraphData/polygon",
  [CHAIN.FANTOM]: "https://api.curve.fi/api/getSubgraphData/fantom",
  [CHAIN.ARBITRUM]: "https://api.curve.fi/api/getSubgraphData/arbitrum",
  [CHAIN.AVAX]: "https://api.curve.fi/api/getSubgraphData/avalanche",
  [CHAIN.OPTIMISM]: "https://api.curve.fi/api/getSubgraphData/optimism",
  [CHAIN.XDAI]: "https://api.curve.fi/api/getSubgraphData/xdai",
  // [CHAIN.CELO]: "https://api.curve.fi/api/getSubgraphData/celo",
  [CHAIN.FRAXTAL]: "https://api.curve.fi/api/getSubgraphData/fraxtal",
  [CHAIN.BASE]: "https://api.curve.fi/api/getVolumes/base"
};

interface IAPIResponse {
  success: boolean
  data: {
    totalVolume: number,
    cryptoShare: number,
    generatedTimeMs: number
    totalVolumes: {
      totalVolume: number
    }
  }
}

const fetch = (chain: string) => async (timestamp: number) => {
  try {
    const response: IAPIResponse = (await fetchURL(endpoints[chain]));
    const t = response.data.generatedTimeMs ? response.data.generatedTimeMs / 1000 : timestamp
    if (chain === CHAIN.BASE) {
      return {
        dailyVolume: `${response.data.totalVolumes.totalVolume}`,
        timestamp: t,
      }
    }
    return {
      dailyVolume: `${response.data.totalVolume}`,
      timestamp: t,
    };
  } catch (e) {
    return { timestamp }
  }

};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain),
                runAtCurrTime: true
      }
    }
  }, {})
};
export default adapter;
