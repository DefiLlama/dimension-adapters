import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions } from "../../adapters/types";

const endpoints = {
  [CHAIN.METIS]:
    "https://metisapi.0xgraph.xyz/subgraphs/name/metis-andromeda-prod-stats",
};

type MarketStat = {
  id: string;
  totalTradingVolume: string;
};

type MarketDailyStat = {
  day: number;
  tradingVolume: string;
}

const fetch = async (_t: any, _tt: any, options: FetchOptions) => {
  const dayId = Math.floor(options.startOfDay / 86400);
  const query = gql`
    {
      marketDailyStats(where: { day: ${dayId} }) {
        day
        tradingVolume
      }
      marketStats {
        id
        totalTradingVolume
      }
    }
  `;
  const graphQLClient = new GraphQLClient(endpoints[options.chain]);
  graphQLClient.setHeader("origin", "https://zeno.exchange");
  const data = await graphQLClient.request(query);
  const dailyVolume = data.marketDailyStats.reduce(
    (accum: number, t: MarketDailyStat) => accum + parseInt(t.tradingVolume) / 1e30,
    0 as number
  );
  return {
    timestamp: options.startOfDay,
    dailyVolume: dailyVolume,
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.METIS]: {
      fetch: fetch,
      start: '2024-03-13',
    },
  },
};

export default adapter;
