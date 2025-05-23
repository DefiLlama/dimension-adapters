import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL"

const endpoints: { [chain: string]: string } = {
  [CHAIN.ETHEREUM]: "https://api.curve.finance/api/getVolumes/ethereum",
  [CHAIN.POLYGON]: "https://api.curve.finance/api/getVolumes/polygon",
  [CHAIN.FANTOM]: "https://api.curve.finance/api/getVolumes/fantom",
  [CHAIN.ARBITRUM]: "https://api.curve.finance/api/getVolumes/arbitrum",
  [CHAIN.AVAX]: "https://api.curve.finance/api/getSubgraphData/avalanche",
  [CHAIN.OPTIMISM]: "https://api.curve.finance/api/getVolumes/optimism",
  [CHAIN.XDAI]: "https://api.curve.finance/api/getVolumes/xdai",
  // [CHAIN.CELO]: "https://api.curve.fi/api/getSubgraphData/celo",
  [CHAIN.FRAXTAL]: "https://api.curve.finance/api/getVolumes/fraxtal",
  [CHAIN.BASE]: "https://api.curve.finance/api/getVolumes/base"
};

interface IAPIResponse {
  success: boolean
  data: {
    pools: {
      volumeUSD: number
    }[],
    poolList: {
      volumeUSD: number
    }[],
    cryptoShare: number,
    generatedTimeMs: number
  }
}

const fetch = (chain: string) => async (timestamp: number) => {
  const response: IAPIResponse = (await fetchURL(endpoints[chain]));
  const t = response.data.generatedTimeMs ? response.data.generatedTimeMs / 1000 : timestamp
  if (chain === CHAIN.AVAX) {
    return {
      dailyVolume: `${response.data.poolList.reduce((acc, pool) => acc + pool.volumeUSD, 0)}`,
      timestamp: t,
    }
  }
  const dailyVolume = response.data.pools.reduce((acc, pool) => acc + pool.volumeUSD, 0)
  return {
    dailyVolume: `${dailyVolume}`,
    timestamp: t,
  };
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
