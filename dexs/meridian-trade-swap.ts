import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoints: { [key: string]: string } = {
    [CHAIN.BASE]: "https://subgraph.meridianfinance.net/subgraphs/name/perpetuals-stats"
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
    const chain = CHAIN.BASE
    const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataSwap, {
        id: chain === CHAIN.BASE
            ? String(options.startOfDay)
            : String(options.startOfDay) + ':daily',
        period: 'daily',
    })

    return {
        dailyVolume:
            dailyData.volumeStats.length == 1
                ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
                : '0',
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.BASE],
    start: '2023-08-12',
}

export default adapter;
