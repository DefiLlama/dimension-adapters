import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql` query value {
      summation {
          tradingVolume1D
          totalValueLocked
          totalVirtualLocked
      }
  }`
}

const graphQLClient = new GraphQLClient("https://api.pangeaswap.com/graphql");

const getGQLClient = () => {
  return graphQLClient
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dailyVolume = (await getGQLClient().request(getDailyVolume()))?.summation?.tradingVolume1D;

  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolume ? dailyVolume.toString() : undefined,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
