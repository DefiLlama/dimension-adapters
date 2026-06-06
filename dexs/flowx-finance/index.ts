import { gql, GraphQLClient } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
      exchangeTotalVolume {
        totalVolume
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
  transaction24H: string;
  volume24H: string;
  volume7D: string;
}

export interface IExchangeTotalVolume {
  totalVolume: string;
}

const fetch = async (options: FetchOptions) => {
  const statsRes = await getGQLClient().request(getDailyVolume());
  const historicalVolume: IExchangeStats = statsRes.exchangeStats;
  return {
    dailyVolume: historicalVolume.volume24H
      ? `${historicalVolume.volume24H}`
      : undefined,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SUI],
  start: '2023-01-13',
  runAtCurrTime: true,
};

export default adapter;
