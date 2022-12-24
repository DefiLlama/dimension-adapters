// https://heliswap-prod-362307.oa.r.appspot.com/query
import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    getMetrics {
      time
      volume
    }
  }`
}

const graphQLClient = new GraphQLClient("https://heliswap-prod-362307.oa.r.appspot.com/query");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  time: string;
  volume: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const historicalVolume: IGraphResponse[] = (await getGQLClient().request(getDailyVolume())).getMetrics;
  const totalVolume = historicalVolume
    .filter(volItem => Number(volItem.time) <= dayTimestamp)
    .reduce((acc, { volume }) => acc + Number(volume), 0);

  const dailyVolume = historicalVolume
    .find(dayItem => Number(dayItem.time) === dayTimestamp)?.volume;

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch: fetch,
      start: async () => 1664928000
    },
  },
};

export default adapter;
