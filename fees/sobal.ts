import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, SimpleAdapter } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const v2Endpoints = {
  [CHAIN.NEON]:
    "https://neon-subgraph.sobal.fi/sobal-pools",
  // [CHAIN.BASE]: "https://api.studio.thegraph.com/query/50526/sobal-base/version/latest",
};

const v2Graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const startTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const dayId = Math.floor(startTimestamp / 86400)

      const graphQuery = gql
        `query fees($dayId: String!, $yesterdayId: String!) {
        today: balancerSnapshot(id: $dayId) {
          totalSwapFee
        }
        yesterday: balancerSnapshot(id: $yesterdayId) {
          totalSwapFee
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery, {
        dayId: `2-${dayId}`,
        yesterdayId: `2-${dayId - 1}`
      });
      const currentTotalSwapFees = new BigNumber(graphRes["today"]["totalSwapFee"])

      const dailyFee = currentTotalSwapFees.minus(new BigNumber(graphRes["yesterday"]["totalSwapFee"]))

      // Currently 50% of Fees
      const dailyRevenue = dailyFee.multipliedBy(0.5);
      const totalRevenue = currentTotalSwapFees.multipliedBy(0.5);

      return {
        timestamp,
        totalUserFees: graphRes["today"]["totalSwapFee"],
        dailyUserFees: dailyFee.toString(),
        totalFees: graphRes["today"]["totalSwapFee"],
        dailyFees: dailyFee.toString(),
        totalRevenue: totalRevenue.toString(),
        dailyRevenue: dailyRevenue.toString(),
        totalProtocolRevenue: totalRevenue.toString(),
        dailyProtocolRevenue: dailyRevenue.toString(),
        totalSupplySideRevenue: new BigNumber(graphRes["today"]["totalSwapFee"]).minus(totalRevenue.toString()).toString(),
        dailySupplySideRevenue: new BigNumber(dailyFee.toString()).minus(dailyRevenue.toString()).toString(),
      };
    };
  };
};

const methodology = {
  UserFees: "Trading fees paid by users, ranging from 0.0001% to 10%",
  Fees: "All trading fees collected (doesn't include withdrawal and flash loan fees)",
  Revenue: "Protocol revenue from all fees collected",
  ProtocolRevenue: "Currently no protocol swap fee in place",
  SupplySideRevenue: "A small percentage of the trade paid by traders to pool LPs, set by the pool creator or managed by protocol.",
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.NEON]: {
      fetch: v2Graphs(v2Endpoints)(CHAIN.NEON),
      start: 1689613200, // 17TH JULY 5PM GMT
      meta: {
        methodology
      }
    },
    // [CHAIN.BASE]: {
    //   fetch: v2Graphs(v2Endpoints)(CHAIN.BASE),
    //   start: 1690850000, // 1ST AUG 12:33 AM GMT
    //   meta: {
    //     methodology
    //   }
    // }
  }
}

export default adapter;
