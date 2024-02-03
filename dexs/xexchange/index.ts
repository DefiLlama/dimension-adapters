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

const graphQLClient = new GraphQLClient("https://graph.xexchange.com/graphql");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  totalVolumeUSD24h: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const historicalVolume: IGraphResponse = (await getGQLClient().request(getDailyVolume())).factory;
  return {
    dailyVolume: historicalVolume.totalVolumeUSD24h ? `${historicalVolume.totalVolumeUSD24h}` : undefined,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetch,
      start: 1664928000
    },
  },
};

export default adapter;
