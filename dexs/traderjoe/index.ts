import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, FetchOptions,  } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume, } from "../../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";

const endpoints: { [s: string | Chain]: string } = {
  [CHAIN.AVAX]: "https://barn.lfj.gg/v1/joev1/dex/analytics/avalanche?startTime=1731974400&aggregateBy=daily",
  [CHAIN.BSC]: "https://barn.lfj.gg/v1/joev1/dex/analytics/binance?startTime=1731974400&aggregateBy=daily",
  [CHAIN.ARBITRUM]: "https://barn.lfj.gg/v1/joev1/dex/analytics/arbitrum?startTime=1731974400&aggregateBy=daily",
};
type TEndpoint = {
  [s: string | Chain]: string;
}
const endpointsV2: TEndpoint = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('6KD9JYCg2qa3TxNK3tLdhj5zuZTABoLLNcnUZXKG9vuH'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('9RoEdAwZiP651miLbKLYQczjckg7HxmyoKXWYXBDYsJc'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('9ANwfoCsnDa2fREYqEpGxWcTQHsmBDeTkdSDXGYAspN7'),
  [CHAIN.ETHEREUM]: "https://barn.traderjoexyz.com/v1/dex/analytics/ethereum?startTime=1695513600&aggregateBy=daily"
}

const TOTAL_FEES = 0.003;
const LP_FEE = 0.0025;
const PROTOCOL_FEES = 0.0005;
const HOLDER_REV = 0.0005;
interface IResponse {
  date: string;
  volumeUsd: number 
}

const fetchV1 = async (_t: any, _b: any, options: FetchOptions) => {
    const { createBalances, chain, startOfDay } = options
    const date = getTimestampAtStartOfDayUTC(startOfDay)
    const dateStr = new Date(date * 1000).toISOString().split('T')[0]
    const response: IResponse[] = await httpGet(endpoints[chain])
    const dailyVolume = createBalances()
    const volume = response.find((item) => item.date.split('T')[0] === dateStr)?.volumeUsd || 0
    dailyVolume.addUSDValue(volume)
    const dailyFees = dailyVolume.clone(TOTAL_FEES)
    const dailyRevenue = dailyVolume.clone(PROTOCOL_FEES)
    const dailyHoldersRevenue = dailyVolume.clone(HOLDER_REV)
    const dailySupplySideRevenue = dailyVolume.clone(LP_FEE)
    return {
      dailyVolume,
      timestamp: date,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
    }
}


const graphsV2 = getChainVolume({
  graphUrls: endpointsV2,
  totalVolume: {
    factory: "lbfactories",
    field: "volumeUSD",
  },
});

const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v1: {
      [CHAIN.AVAX]: {
        fetch:  fetchV1,
        start: '2021-08-09',
      },
      [CHAIN.BSC]: {
        fetch: fetchV1,
        start: '2022-10-04',
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetchV1,
        start: '2022-10-04',
      },
    },
    v2: {
      [CHAIN.AVAX]: {
        fetch: graphsV2(CHAIN.AVAX),
        start: '2022-11-16'
      },
      [CHAIN.ARBITRUM]: {
        fetch: graphsV2(CHAIN.ARBITRUM),
        start: '2022-12-26'
      },
      [CHAIN.BSC]: {
        fetch: graphsV2(CHAIN.BSC),
        start: '2023-03-03'
      },
      // [CHAIN.ETHEREUM]: {
      //   fetch: fetchV2,
      //   start: '2023-09-24'
      // }
    }
  },
};

export default adapter;
