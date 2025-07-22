import { FetchOptions, SimpleAdapter } from "../../adapters/types";
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
  [CHAIN.BASE]: "https://api.curve.finance/api/getVolumes/base",
  [CHAIN.FRAXTAL]: "https://api.curve.finance/api/getVolumes/fraxtal",
  [CHAIN.SONIC]: "https://api.curve.finance/api/getVolumes/sonic",
  [CHAIN.HYPERLIQUID]: "https://api.curve.finance/api/getVolumes/hyperliquid"
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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const response: IAPIResponse = (await fetchURL(endpoints[options.chain]));
  if (options.chain === CHAIN.AVAX) {
    return {
      dailyVolume: `${response.data.poolList.reduce((acc, pool) => acc + pool.volumeUSD, 0)}`,
    }
  }
  const dailyVolume = response.data.pools.reduce((acc, pool) => acc + pool.volumeUSD, 0)
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        runAtCurrTime: true
      }
    }
  }, {})
};
export default adapter;
