import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

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

const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataDerivatives, {
    id: `day-${String(options.startOfDay)}`,
    period: 'daily',
  })

  return {
    timestamp: options.startOfDay,
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
  fetch,
  adapter: {
    [CHAIN.BSC]: {
      start: startTimestamps[CHAIN.BSC],
    },
    [CHAIN.ARBITRUM]: {
      start: startTimestamps[CHAIN.ARBITRUM],
    }
  },
  deadFrom: "2025-06-25",
};

export default adapter;
