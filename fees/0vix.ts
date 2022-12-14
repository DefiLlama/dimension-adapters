import { Adapter } from "../adapters/types";
import { POLYGON } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../helpers/getBlock";
import { ChainBlocks } from "../adapters/types";
import BigNumber from "bignumber.js";
import {
  getTimestampAtStartOfPreviousDayUTC,
  getTimestampAtStartOfDayUTC,
} from "../utils/date";

const endpoints = {
  [POLYGON]:
    "https://api.thegraph.com/subgraphs/name/0vix/ovix-lending-subgraph",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400);

      const graphQuery = gql`{
        financialsDailySnapshot(id: ${dateId}) {
            cumulativeTotalRevenueUSD
            dailyTotalRevenueUSD
            cumulativeProtocolSideRevenueUSD
            dailyProtocolSideRevenueUSD
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const totalFee = new BigNumber(
        graphRes.financialsDailySnapshot.cumulativeTotalRevenueUSD
      );
      const dailyFee = new BigNumber(
        graphRes.financialsDailySnapshot.dailyTotalRevenueUSD
      );
      const totalRev = new BigNumber(
        graphRes.financialsDailySnapshot.cumulativeProtocolSideRevenueUSD
      );
      const dailyRev = new BigNumber(
        graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD
      );

      return {
        timestamp,
        totalFees: totalFee.toString(),
        dailyFees: dailyFee.toString(),
        totalRevenue: totalRev.toString(),
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [POLYGON]: {
      fetch: graphs(endpoints)(POLYGON),
      start: async () => 1648157552,
    },
  },
};

export default adapter;
