import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints: { [key: string]: string } = {
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('B8ZSq8gQJGk3C8hduPokgkr4PVcfe4Ydy5jDBk8siPe4'),
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
  const dailyData: IGraphResponse = await request(endpoints[options.chain], historicalDataSwap, {
    id: String(options.startOfDay),
    period: 'daily',
  })

  return {
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : '0',
  }
};

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.OPTIMISM]: 1667520000,
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OPTIMISM],
  start: startTimestamps[CHAIN.OPTIMISM],
};

export default adapter;
