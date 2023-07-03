import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const getDailyVolume = () => {
  return gql`
    {
      exchangeStats {
        fee24H
        totalLiquidity
        transaction24H
        volume24H
        volume7D
        totalLiquidityInUSD
      }
    }
  `;
};

const graphQLClient = new GraphQLClient(
  "https://api.flowx.finance/flowx-be/graphql"
);
const getGQLClient = () => {
  return graphQLClient;
};

export interface IExchangeStats {
  fee24H: string;
  totalLiquidity: string;
  totalLiquidityInUSD: string;
  transaction24H: number;
  volume24H: string;
  volume7D: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const historicalVolume: IExchangeStats = (
    await getGQLClient().request(getDailyVolume())
  ).exchangeStats;
  return {
    totalVolume: historicalVolume.totalLiquidityInUSD
      ? historicalVolume.totalLiquidityInUSD
      : undefined,
    dailyVolume: historicalVolume.volume24H
      ? `${historicalVolume.volume24H}`
      : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      start: async () => 1673568000,
    },
  },
};

export default adapter;
