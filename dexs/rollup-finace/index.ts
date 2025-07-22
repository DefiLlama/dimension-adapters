import { gql } from "graphql-request";
import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const endpoints: { [key: string]: string } = {
  [CHAIN.ERA]: "https://subgraph.rollup.finance/subgraphs/name/rollUp/stats",
}

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        swap
      }
  }
`

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        liquidation
        margin
      }
  }
`

interface IGraphResponse {
  list: Array<{
    burn: string,
    liquidation: string,
    margin: string,
    mint: string,
    swap: string,
    period: string
  }>
}


const fetchDerivatives = async (timestamp: number) => {
  const data: IGraphResponse = (await httpGet("https://terminal.rollup.finance/analy-v1/analytics/volume?pageNum=1&pageSize=32")).data
  const dataItem = data.list.find((e) => e.period === getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)).toString())
  const dailyVolume = Number(dataItem?.liquidation || 0) + Number(dataItem?.margin || 0)
  return {
    dailyFees: dailyVolume.toString(),
    timestamp

  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ERA]: 1682035200,
}
const adapter: BreakdownAdapter = {
  breakdown: {
    // "swap": Object.keys(endpoints).reduce((acc, chain) => {
    //   return {
    //     ...acc,
    //     [chain]: {
    //       fetch: getFetch(historicalDataSwap)(chain),
    //       start: startTimestamps[chain]
    //     }
    //   }
    // }, {}),
    "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch:  fetchDerivatives,
          start: startTimestamps[chain]
        }
      }
    }, {})
  },
  deadFrom: "2024-09-31",
}

export default adapter;
