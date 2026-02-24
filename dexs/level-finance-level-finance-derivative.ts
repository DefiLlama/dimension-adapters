import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('AFaRssJTqNReTtU2XdTGPhN38YVPNBc7faMNKA1mU54h'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AV58XWaZUZPJ2w1x2wYmGEivVZmDojGW3fAYggUAujtD'),
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
    trading: string,
  }>
}

const getFetch = (query: string) => (chain: string): Fetch => async (timestamp: number) => {
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

const adapter: SimpleAdapter = {
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

export default adapter;
