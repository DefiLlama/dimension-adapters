import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('FxC8dAGA6jXCN4EUoPqDeoUWM9XE1VrttiEVT7LEGyxw'),
}

const startTimestamps: { [chain: string]: string } = {
  [CHAIN.BSC]: '2022-12-30',
}

const historicalDataSwap = gql`
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

const fetch = async (timestamp: number, _a:any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[options.chain], historicalDataSwap, {
    id: String(dayTimestamp),
    period: 'daily',
  })
  const totalData: IGraphResponse = await request(endpoints[options.chain], historicalDataSwap, {
    id: 'total',
    period: 'total',
  })

  return {
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined
  }
}

const adapter: SimpleAdapter = {
  deadFrom: '2023-09-12',
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: startTimestamps[CHAIN.BSC],
    },
  },
};

export default adapter;
