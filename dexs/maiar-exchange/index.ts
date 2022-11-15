import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    factory {
      totalVolumeUSD24h
    }
  }`
}

const graphQLClient = new GraphQLClient(" https://graph.maiar.exchange/graphql");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  totalVolumeUSD24h: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const response: IGraphResponse = (await getGQLClient().request(getDailyVolume())).factory;

  return {
    timestamp: dayTimestamp,
    dailyVolume: response.totalVolumeUSD24h,
    totalVolume: "0",
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetch,
      start: async () => 0,
      runAtCurrTime: true
    },
  },
};

export default adapter;
