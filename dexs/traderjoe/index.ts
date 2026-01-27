import * as sdk from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import { BreakdownAdapter, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume, } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";
import { uniV2Exports } from "../../helpers/uniswap";

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
  const { chain, dateString } = options
  const response: IResponse[] = await httpGet(endpoints[chain])
  let volume = response.find((item) => item.date.split('T')[0] === dateString)?.volumeUsd
  if (!volume) throw new Error(`No volume found for date: ${dateString}`)

  // fix bad data from traderjoe api
  // use data from subgraph: H2VGe2tYavUEosSjomHwxbvCKy3LaNaW8Kjw2KhhHs1K
  if (options.startOfDay === 1749600000 && options.chain === 'avax') {
    volume = 4438405;
  }

  return {
    dailyVolume: volume,
    dailyFees: volume * TOTAL_FEES,
    dailyRevenue: volume * PROTOCOL_FEES,
    dailyHoldersRevenue: volume * HOLDER_REV,
    dailySupplySideRevenue: volume * LP_FEE,
  }
}


const graphsV2 = getChainVolume({
  graphUrls: endpointsV2,
  totalVolume: {
    factory: "lbfactories",
    field: "volumeUSD",
  },
});

const uniV2LogAdapters = uniV2Exports({
  [CHAIN.BSC]: { factory: '0x4f8bdc85e3eec5b9de67097c3f59b6db025d9986', start: '2022-10-04', fees: TOTAL_FEES, revenueRatio: PROTOCOL_FEES/TOTAL_FEES, holdersRevenueRatio: PROTOCOL_FEES/TOTAL_FEES, },
  [CHAIN.AVAX]: { factory: '0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10', start: '2021-08-09', fees: TOTAL_FEES, revenueRatio: PROTOCOL_FEES/TOTAL_FEES, holdersRevenueRatio: PROTOCOL_FEES/TOTAL_FEES, },
}, { runAsV1: true,})

const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v1: {
      ...uniV2LogAdapters.adapter,
      // [CHAIN.AVAX]: {
      //   fetch: fetchV1,
      //   start: '2021-08-09',
      // },
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
