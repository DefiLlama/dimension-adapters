import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { adapter_derivative } from "./level-finance-derivative";

const endpoints: { [key: string]: string } = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('AFaRssJTqNReTtU2XdTGPhN38YVPNBc7faMNKA1mU54h'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AV58XWaZUZPJ2w1x2wYmGEivVZmDojGW3fAYggUAujtD'),
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
  [CHAIN.BSC]: 1670630400,
  [CHAIN.ARBITRUM]: 1686344400,
}

const adapter: any = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: getFetch(historicalDataSwap)(CHAIN.BSC),
      start: startTimestamps[CHAIN.BSC],
    },
    [CHAIN.ARBITRUM]: {
      fetch: getFetch(historicalDataSwap)(CHAIN.ARBITRUM),
      start: startTimestamps[CHAIN.ARBITRUM],
    }
  },
};

const adapterBreakdown: BreakdownAdapter = {
  breakdown: {
    "level-finance": adapter["adapter"],
    "level-finance-derivative": adapter_derivative["adapter"]
  }
}
export default adapterBreakdown;
