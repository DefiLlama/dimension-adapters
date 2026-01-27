import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('9USQeMVzzBbxsXhQUmCk5fZursvL9Vj3cv8joYNXeKt9'),
}

const historicalData = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        swap
      }
  }
`

interface IGraphResponse {
  volumeStats: Array<{
    burn: string,
    liquidation: string,
    margin: string,
    mint: string,
    swap: string,
  }>
}

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[options.chain], historicalData, {
    id: String(dayTimestamp) + ':daily',
    period: 'daily',
  })

  return {
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : '0',
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.FANTOM]: 1689767230,
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: startTimestamps[chain],
      }
    }
  }, {})
}

export default adapter;
