import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    pairsDayDatas {
      timestamp
      volumeUSD24h
    }
  }`
}

const graphQLClient = new GraphQLClient("https://graph.xexchange.com/graphql");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  timestamp: string;
  volumeUSD24h: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(getDailyVolume())).pairsDayDatas;

  const totalVolume = historicalVolume
    .filter(volItem => getUniqStartOfTodayTimestamp(new Date(volItem.timestamp)) <= dayTimestamp)
    .reduce((acc, { volumeUSD24h }) => acc + Number(volumeUSD24h), 0);

  const dailyVolume = historicalVolume
    .filter(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.timestamp)) === dayTimestamp)
    .reduce((acc, { volumeUSD24h }) => acc + Number(volumeUSD24h), 0);

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetch,
      start: async () => 1652832000
    },
  },
};

export default adapter;
