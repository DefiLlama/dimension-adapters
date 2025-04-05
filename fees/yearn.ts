import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [ETHEREUM]: sdk.graph.modifyEndpoint(
    "FDLuaz69DbMADuBjJDEcLnTuPnjhZqNbFVrkNiBLGkEg"
  ),
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400);

      const graphQuery = gql`{
        financialsDailySnapshot(id: ${dateId}) {
            dailyTotalRevenueUSD
            dailyProtocolSideRevenueUSD
            dailySupplySideRevenueUSD
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee = graphRes.financialsDailySnapshot.dailyTotalRevenueUSD

      const dailyRevenue = graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD
 
      const dailySSRev = graphRes.financialsDailySnapshot.dailySupplySideRevenueUSD
 

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyRevenue.toString(),
        dailySupplySideRevenue: dailySSRev.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch: graphs(endpoints)(ETHEREUM),
      start: "2023-01-01",
    },
  },
};

export default adapter;
