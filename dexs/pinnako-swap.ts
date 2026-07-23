import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoints: { [key: string]: string } = {
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/49418/zkmain_stats/version/latest",
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

const fetch = async (options: FetchOptions) => {
  const chain = CHAIN.ERA
  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataSwap, {
    id: String(options.startOfDay),
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
  chains: [CHAIN.ERA],
  start: '2023-07-05',
}

export default adapter;
