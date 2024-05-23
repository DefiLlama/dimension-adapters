import request, { gql } from "graphql-request";
import { BreakdownAdapter, DISABLED_ADAPTER_KEY, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import disabledAdapter from "../../helpers/disabledAdapter";

const endpoints: { [key: string]: string } = {
    [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/metavault-trade/grizzly-bnb-subgraph",
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
    breakdown: {
        "swap": Object.keys(endpoints).reduce((acc, chain) => {
            return {
                ...acc,
                [DISABLED_ADAPTER_KEY]: disabledAdapter,
                [chain]: {
                    fetch: getFetch(historicalDataSwap)(chain),
                    start: startTimestamps[chain]
                }
            }
        }, {}),
        "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
            return {
                ...acc,
                [DISABLED_ADAPTER_KEY]: disabledAdapter,
                [chain]: {
                    fetch: getFetch(historicalDataDerivatives)(chain),
                    start: startTimestamps[chain]
                }
            }
        }, {})
    }
}

export default adapter;
