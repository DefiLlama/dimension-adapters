import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('3CUU9roJ9PsMdijcBdaCBRHhTUBobLeDLyMW4QF2XNmn'),
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
    volumeStats: Array<{
        burn: string,
        liquidation: string,
        margin: string,
        mint: string,
        swap: string,
    }>
}

const getFetch = (query: string) => (chain: string): Fetch => async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
    const dailyData: IGraphResponse = await request(endpoints[chain], query, {
        id: String(dayTimestamp) + ':daily',
        period: 'daily',
    })
    const totalData: IGraphResponse = await request(endpoints[chain], query, {
        id: 'total',
        period: 'total',
    })

    return {
        timestamp: dayTimestamp,
        dailyVolume:
            dailyData.volumeStats.length == 1
                ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
                : undefined,
        totalVolume:
            totalData.volumeStats.length == 1
                ? String(Number(Object.values(totalData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
                : undefined,

    }
}

const startTimestamps: { [chain: string]: number } = {
    [CHAIN.BSC]: 1689897600,
}

const adapter: BreakdownAdapter = {
    deadFrom: '2024-02-02',
    breakdown: {
        "swap": Object.keys(endpoints).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: getFetch(historicalDataSwap)(chain),
                    start: startTimestamps[chain]
                }
            }
        }, {}),
        "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: getFetch(historicalDataDerivatives)(chain),
                    start: startTimestamps[chain]
                }
            }
        }, {})
    }
}

export default adapter;
