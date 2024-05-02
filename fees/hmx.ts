import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [CHAIN.ARBITRUM]:
    "https://subgraph.satsuma-prod.com/3a60064481e5/1lxclx3pz4zrusx6414nvj/arbitrum-one-stats/api",
  [CHAIN.BLAST]:
    "https://api.studio.thegraph.com/query/45963/blast-mainnet-stats/version/latest",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      if (chain === CHAIN.ARBITRUM || chain === CHAIN.BLAST) {
        const floorDayTimestamp = getTimestampAtStartOfDayUTC(timestamp);
        const totalFeeQuery = gql`
          {
            globalFeesStat(id: "global") {
              totalFeePaid
            }
          }
        `;
        const dailyFeeQuery = gql`
          {
            dailyFeesStat(id: "${floorDayTimestamp}") {
              totalFeePaid
            }
          }
        `;
        const graphQLClient = new GraphQLClient(graphUrls[chain]);
        graphQLClient.setHeader("origin", "https://hmx.org");
        const totalFeeResp = await graphQLClient.request(totalFeeQuery);
        const dailyFeeResp = await graphQLClient.request(dailyFeeQuery);

        const finalizedDailyFee =
          Number(dailyFeeResp.dailyFeesStat.totalFeePaid) / 1e30;
        const finalizedTotalFee =
          Number(totalFeeResp.globalFeesStat.totalFeePaid) / 1e30;

        return {
          timestamp,
          dailyFees: finalizedDailyFee.toString(),
          totalFees: finalizedTotalFee.toString(),
          dailyHoldersRevenue: (finalizedDailyFee * 0.25).toString(),
          dailySupplySideRevenue: (finalizedDailyFee * 0.75).toString(),
        };
      }

      return {
        timestamp,
        dailyFees: "0",
        totalFees: "0",
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: 1687392000,
    },
    [CHAIN.BLAST]: {
      fetch: graphs(endpoints)(CHAIN.BLAST),
      start: 1707094598,
    },
  },
};

export default adapter;
