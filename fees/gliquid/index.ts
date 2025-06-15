import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Fees: "Swap fees paid by users.",
};

const graphQLClient = new GraphQLClient(
  "https://api.goldsky.com/api/public/project_cmb20ryy424yb01wy7zwd7xd1/subgraphs/analytics/v1.0.0/gn"
);

const getFees = () => {
  return gql`
    query GetFees($date: Int!) {
      algebraDayDatas(where: { date: $date }) {
        feesUSD
      }
      factories {
        totalFeesUSD
      }
    }
  `;
};

const getGQLClient = () => {
  return graphQLClient;
};

const fetch = async ({ startOfDay }: FetchOptions) => {
  const feesRes = await getGQLClient().request(getFees(), {
    date: startOfDay,
  });
  const dailyFees = feesRes.algebraDayDatas[0].feesUSD;
  const totalFees = feesRes.factories[0].totalFeesUSD;
  return {
    dailyFees: dailyFees,
    totalFees: totalFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetch,
      start: "2025-05-29",
      meta: {
        methodology,
      },
    },
  },
  version: 1,
};

export default adapter;
