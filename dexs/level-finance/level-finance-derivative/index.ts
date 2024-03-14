import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../../../adapters/types";
import { CHAIN } from "../../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/level-fi/levelfinanceanalytics",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/level-fi/analytics-arb",
}

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
      trading
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

const getFetch = (query: string)=> (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: `day-${String(dayTimestamp)}`,
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
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))))
        : undefined,
    totalVolume:
      totalData.volumeStats.length == 1
        ? String(Number(Object.values(totalData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))))
        : undefined,
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.BSC]: 1670630400,
  [CHAIN.ARBITRUM]: 1686344400,
}

const adapter_derivative: any = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: getFetch(historicalDataDerivatives)(CHAIN.BSC),
      start: startTimestamps[CHAIN.BSC],
    },
    [CHAIN.ARBITRUM]: {
      fetch: getFetch(historicalDataDerivatives)(CHAIN.ARBITRUM),
      start: startTimestamps[CHAIN.ARBITRUM],
    }
  },
};

export {
  adapter_derivative
}
