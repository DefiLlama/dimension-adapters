// // Source: https://gliquids-organization.gitbook.io/gliquid/about-us/fee-structure

// import request, { gql } from "graphql-request";
// import { FetchOptions, SimpleAdapter } from "../../adapters/types";
// import { CHAIN } from "../../helpers/chains";

// const endpoint = "https://api.goldsky.com/api/public/project_cmb20ryy424yb01wy7zwd7xd1/subgraphs/analytics/1.2.3/gn"


// const fetch = async ({ startOfDay }: FetchOptions) => {
//   const query = gql`
//     query GetFees($date: Int!) {
//       algebraDayDatas(where: { date: $date }) {
//         feesUSD
//       }
//     }
//   `;
//   const feesRes = await request(endpoint, query, {
//     date: startOfDay,
//   });

//   const dailyFees = feesRes.algebraDayDatas[0].feesUSD;
//   const dailyProtocolRevenue = dailyFees * 0.13;
//   const dailySupplySideRevenue = dailyFees * 0.87;

//   return {
//     dailyFees,
//     dailyUserFees: dailyFees,
//     dailyRevenue: dailyProtocolRevenue,
//     dailyProtocolRevenue,
//     dailySupplySideRevenue,
//     dailyHoldersRevenue: 0,
//   };
// };


// const adapter: SimpleAdapter = {
//   version: 2,
//   adapter: {
//     [CHAIN.HYPERLIQUID]: {
//       fetch: fetch,
//       start: "2025-05-29",
//     },
//   },
//   methodology: {
//     Fees: "Swap fees paid by users.",
//     UserFees: "Swap fees paid by users",
//     Revenue: "Total revenue from fees",
//     ProtocolRevenue: "5% of fee goes to the protocol",
//     SupplySideRevenue: "95% of fee goes to the supply side",
//   },
// };

// export default adapter;

import adapter from "../../dexs/gliquid";

export default adapter;
