import fetchURL from "../../utils/fetchURL"
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints: Record<string, string> = {
  [CHAIN.ETHEREUM]: "https://app.dforce.network/dashboard/lsr/DayTokenInfo?network=mainnet",
  [CHAIN.POLYGON]: "https://app.dforce.network/dashboard/lsr/DayTokenInfo?network=Polygon",
  [CHAIN.ARBITRUM]: "https://app.dforce.network/dashboard/lsr/DayTokenInfo?network=ArbitrumOne",
  [CHAIN.OPTIMISM]: "https://app.dforce.network/dashboard/lsr/DayTokenInfo?network=Optimism",
  [CHAIN.BSC]: "https://app.dforce.network/dashboard/lsr/DayTokenInfo?network=bsc"
};

interface IAPIResponse {
  data: {
    preChain:[
      {
        volume: string
      }
    ]
  }
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const response: IAPIResponse = (await fetchURL(endpoints[options.chain]));
  const dailyVolume = response.data.preChain.reduce((acc,cur) => {return acc + parseInt(cur.volume)/10**18}, 0)

  return {
    dailyVolume
  };
};

const adapter: SimpleAdapter = {
  deadFrom: '2025-07-24', // rebranded to usx finance
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: '2023-03-18',
        runAtCurrTime: true
      }
    }
  }, {})
};

export default adapter;
