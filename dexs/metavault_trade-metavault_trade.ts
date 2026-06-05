import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('BMn9XsegbLxw9TL6uyw5NntoiGRyMqRpF2vShkKzusJ3'),
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

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((options.toTimestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[options.chain], historicalData, {
    id: String(dayTimestamp) + ':daily',
    period: 'daily',
  })

  return {
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.POLYGON],
  start: 1654041600,
  deadFrom: "2025-06-04",
}

export default adapter;
