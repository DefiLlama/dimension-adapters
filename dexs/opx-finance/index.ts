import BigNumber from "bignumber.js";
import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`{
    volumeStats(first:1000) {
      id
      swap
    }
  }`
}

const graphQLClient = new GraphQLClient("https://api.thegraph.com/subgraphs/name/opx-finance/opx-op-stats");
const getGQLClient = () => {
  return graphQLClient
}

interface IGraphResponse {
  id: string;
  swap: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const response: IGraphResponse[] = (await getGQLClient().request(getDailyVolume())).volumeStats;
  const totalVolume = response
  .filter((e: IGraphResponse) => e.id !== "total")
  .filter(volItem => Number(volItem.id) <= dayTimestamp)
  .reduce((acc, { swap }) => new BigNumber(swap).div(new BigNumber(10).pow(30)).plus(acc), new BigNumber('0'))

const dailyVolume = response
  .filter((e: IGraphResponse) => e.id !== "total")
  .find(dayItem =>  Number(dayItem.id) === dayTimestamp)?.swap

  return {
    timestamp: dayTimestamp,
    dailyVolume: `${dailyVolume ? new BigNumber(dailyVolume).div(new BigNumber(10).pow(30)).toNumber(): 0}`,
    totalVolume: totalVolume.toString(),
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch,
      start: async () => 1667520000,
    },
  },
};

export default adapter;
