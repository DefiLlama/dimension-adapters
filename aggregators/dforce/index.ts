import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints: { [chain: string]: string } = {
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

const fetch = (chain: string) => async (timestamp: number) => {
  const response: IAPIResponse = (await fetchURL(endpoints[chain]));
  const totalDailyVolume = response.data.preChain.reduce((acc,cur) => {return acc + parseInt(cur.volume)/10**18}, 0)
  const t = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  return {
    dailyVolume: `${totalDailyVolume}`,
    timestamp: t,
  };
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain),
        start: 1679097600,
        runAtCurrTime: true
      }
    }
  }, {})
};

export default adapter;
