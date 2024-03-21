import request, { gql } from "graphql-request";
import { ChainEndpoints, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


// Subgraphs endpoints
const endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]: "https://subgraph-arb.myx.finance/subgraphs/name/myx-subgraph",
  [CHAIN.LINEA]: "https://subgraph-linea.myx.finance/subgraphs/name/myx-subgraph",
}

const methodology = {
  TotalVolume: "Total Volume from the sum of the open/close/liquidation of positions.",
  DailyVolume: "Daily Volume from the sum of the open/close/liquidation of positions.",
}

interface IGraphResponse {
  tradeVolume: {
    volume: string,
    id: 'string'
  }
}

const getFetch = () => (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))

  const dailyData: IGraphResponse = await request(endpoints[chain], gql`
      query MyQuery {
      tradeVolume(id: "${dayTimestamp}") {
        volume
        id
      }
    }
  `)

  const totalData: IGraphResponse = await request(endpoints[chain], gql`
    query MyQuery {
      tradeVolume(id: "global") {
        volume
        id
      }
    }`
  )

  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyData.tradeVolume?.volume || "0",
    totalVolume: totalData.tradeVolume?.volume || "0",
  }
}


const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1706659200,
  [CHAIN.LINEA]: 1708473600,
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: getFetch()(chain),
        start: startTimestamps[chain],
        meta: {
          methodology: methodology,
        },
      }
    }
  }, {})
}

export default adapter;
