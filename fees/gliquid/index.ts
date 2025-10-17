// Source: https://gliquids-organization.gitbook.io/gliquid/about-us/fee-structure
// Past Source: https://gliquids-organization.gitbook.io/gliquid/about-us/fee-structure

import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint =
  "https://api.goldsky.com/api/public/project_cmb20ryy424yb01wy7zwd7xd1/subgraphs/analytics/1.3.0/gn";

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
  const dailyProtocolRevenue = 0;
  const dailySupplySideRevenue = dailyFees * 1;

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-05-29",
    },
  },
  methodology: {
    Fees: "Swap fees paid by users.",
    UserFees: "Swap fees paid by users",
    Revenue: "0% of fees goes to the protocol, previously it was 13% gliquid and algebra team",
    ProtocolRevenue: "0% of fee goes to the protocol, previously it was 10%",
    SupplySideRevenue: "100% of fee goes to the supply side, previously it was 87%",
  },
};

export default adapter;