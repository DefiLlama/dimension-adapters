import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

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

const getFetch = (query: string)=> (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: String(dayTimestamp),
    period: 'daily',
  })

  return {
    timestamp: dayTimestamp,
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
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getFetch(historicalDataSwap)(CHAIN.FANTOM),
      start: startTimestamps[CHAIN.FANTOM],
    },
    [CHAIN.OPTIMISM]: {
      fetch: getFetch(historicalDataSwap)(CHAIN.OPTIMISM),
      start: startTimestamps[CHAIN.OPTIMISM],
    },
  },
};

export default adapter;
