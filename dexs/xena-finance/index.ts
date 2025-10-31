import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.BASE]: "https://subgraph.xena.finance/subgraphs/name/analyticsv2"
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
    swap: string,
  }>
}

const getFetch = (query: string)=> (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: `day-${String(dayTimestamp)}`,
    period: 'daily',
  })

  return {
    timestamp: dayTimestamp,
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))))
        : undefined,

  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.BASE]: 1696856400,
}

const adapter: SimpleAdapter = {
  deadFrom: '2025-01-01',
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFetch(historicalDataSwap)(CHAIN.BASE),
      start: startTimestamps[CHAIN.BASE],
    }
  },
};

export default adapter;
