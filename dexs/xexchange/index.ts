import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

const fetch = async (_: FetchOptions) => {
  const historicalVolume: IGraphResponse = (await getGQLClient().request(getDailyVolume())).factory;
  return {
    dailyVolume: historicalVolume.totalVolumeUSD24h ? `${historicalVolume.totalVolumeUSD24h}` : undefined,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetch,
      start: '2022-10-05'
    },
  },
};

export default adapter;
