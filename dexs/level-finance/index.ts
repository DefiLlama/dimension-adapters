import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    poolDailyDatas(first: 1000) {
      timestamp
      swapVolume
    }
  }`
}

const graphQLClient = new GraphQLClient("https://graph.level.finance/subgraphs/name/level/main");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  timestamp: string;
  swapVolume: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const response: IGraphResponse[] = (await getGQLClient().request(getDailyVolume())).poolDailyDatas;
  const totalVolume = response
  .filter(volItem => Number(volItem.timestamp) <= dayTimestamp)
  .reduce((acc, { swapVolume }) => acc + Number(swapVolume), 0)

  const dailyVolume = response
  .find(dayItem =>  Number(dayItem.timestamp) === dayTimestamp)?.swapVolume

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: async () => 1670630400,
    },
  },
};

export default adapter;
