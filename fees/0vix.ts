import { Adapter, DISABLED_ADAPTER_KEY } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import disabledAdapter from "../helpers/disabledAdapter";

const endpoints = {
  [CHAIN.POLYGON]:
    "https://api.thegraph.com/subgraphs/name/0vix/ovix-lending-subgraph",
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/30443/0vix-zkevm/v0.0.1",
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
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.POLYGON]: {
      fetch: graphs(endpoints)(CHAIN.POLYGON),
      start: 1648157552,
    },
    // [CHAIN.POLYGON_ZKEVM]: {
    //   fetch: graphs(endpoints)(CHAIN.POLYGON_ZKEVM),
    //   start: 1679923169,
    // },
  },
};

export default adapter;
