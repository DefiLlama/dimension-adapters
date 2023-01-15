import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    beetsGetProtocolData {
      totalSwapVolume
      swapVolume24h
    }
  }`
}


const graphQLClient = new GraphQLClient("https://dex-backend-prod.herokuapp.com/graphql");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  totalSwapVolume: string;
  swapVolume24h: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const historicalVolume: IGraphResponse = (await getGQLClient().request(getDailyVolume())).beetsGetProtocolData;
  return {
    totalVolume: `${historicalVolume.totalSwapVolume}`,
    dailyVolume: historicalVolume.swapVolume24h ? `${historicalVolume.swapVolume24h}` : undefined,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: async () => 1673568000
    },
  },
};

export default adapter;
