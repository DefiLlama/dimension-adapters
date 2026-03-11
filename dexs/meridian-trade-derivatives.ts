import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
    [CHAIN.BASE]: "https://subgraph.meridianfinance.net/subgraphs/name/perpetuals-stats"
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

const fetch = async (timestamp: number) => {
    const chain = CHAIN.BASE
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
    const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataDerivatives, {
        id: chain === CHAIN.BASE
            ? String(dayTimestamp)
            : String(dayTimestamp) + ':daily',
        period: 'daily',
    })

    return {
        timestamp: dayTimestamp,
        dailyVolume:
            dailyData.volumeStats.length == 1
                ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
                : '0',
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: 1691829674,
        }
    }
}

export default adapter;
