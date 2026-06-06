import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints: { [key: string]: string } = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('8LdLE9Aan39FQCcHX3x1HdnNzoZzPvxskhj1utLb2SA9'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('6dZD4zDx9bGZfRdgoUBsZjWBygYVXAe4G41LjTLNJWk1'),
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
        : undefined,
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.FANTOM]: 1670198400,
  [CHAIN.OPTIMISM]: 1677603600,
}

const adapter: SimpleAdapter = {
  fetch,
  adapter: {
    [CHAIN.FANTOM]: {
      start: startTimestamps[CHAIN.FANTOM],
    },
    [CHAIN.OPTIMISM]: {
      start: startTimestamps[CHAIN.OPTIMISM],
    },
  },
};

export default adapter;
