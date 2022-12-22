import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    summaryStatistics {
      volume24h
    }
  }`
}

const graphQLClient = new GraphQLClient("https://mainnet.aux.exchange/graphql");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  volume24h: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const response: IGraphResponse = (await getGQLClient().request(getDailyVolume())).summaryStatistics;

  return {
    timestamp: dayTimestamp,
    dailyVolume: response.volume24h
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: async () => 0,
      runAtCurrTime: true
    },
  },
};

export default adapter;
