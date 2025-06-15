import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint = "https://api.goldsky.com/api/public/project_cmb20ryy424yb01wy7zwd7xd1/subgraphs/analytics/v1.0.0/gn"


const fetch = async ({ startOfDay }: FetchOptions) => {
  const query = gql`
    query GetFees($date: Int!) {
      algebraDayDatas(where: { date: $date }) {
        feesUSD
      }
    }
  `;
  const feesRes = await request(endpoint, query, {
    date: startOfDay,
  });

  const dailyFees = feesRes.algebraDayDatas[0].feesUSD;

  return {
    dailyFees: dailyFees,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetch,
      start: "2025-05-29",
      meta: {
        methodology: {
          Fees: "Swap fees paid by users.",
        },
      },
    },
  },
};

export default adapter;
