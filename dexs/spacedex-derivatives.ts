import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('9ob9R8ufkfEXnqp1s3izXjwQgXEnkSi9KXazYC9LdBC4'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('EMyH7BU8sp2sBCAtfDCqfnXyiKDUf3NbPpU6bg6vdAaH'),
}

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        liquidation
        margin
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
  const chain = options.chain;
  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataDerivatives, {
    id: String(options.startOfDay) + ':daily',
    period: 'daily',
  })
  return {
    timestamp: options.startOfDay,
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : '0',
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1680480000,
  [CHAIN.BSC]: 1678406400,
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: startTimestamps[chain],
        deadFrom: "2024-12-10",
      }
    }
  }, {}),
}

export default adapter;
