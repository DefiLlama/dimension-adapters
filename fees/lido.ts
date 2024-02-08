import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import BigNumber from "bignumber.js";

const endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/lido-ethereum",
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400)

      const graphQuery = gql
      `{
        financialsDailySnapshot(id: ${dateId}) {
            dailyTotalRevenueUSD
            dailyProtocolSideRevenueUSD
            cumulativeTotalRevenueUSD
            cumulativeProtocolSideRevenueUSD
            dailySupplySideRevenueUSD
            cumulativeSupplySideRevenueUSD
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee = new BigNumber(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD);
      const totalFee = new BigNumber(graphRes.financialsDailySnapshot.cumulativeTotalRevenueUSD);
      const dailyRev = new BigNumber(dailyFee).multipliedBy(0.1);
      const totalRev = new BigNumber(totalFee).multipliedBy(0.1);
      const dailySSRev = new BigNumber(graphRes.financialsDailySnapshot.dailySupplySideRevenueUSD);
      const totalSSRev = new BigNumber(graphRes.financialsDailySnapshot.cumulativeSupplySideRevenueUSD);

      return {
        timestamp,
        dailyUserFees: dailyRev.toString(),
        totalUserFees: totalRev.toString(),
        totalFees: totalFee.toString(),
        dailyFees: dailyFee.toString(),
        totalRevenue: totalRev.toString(),
        dailyRevenue: dailyRev.toString(),
        dailyProtocolRevenue: dailyRev.toString(),
        totalProtocolRevenue: totalRev.toString(),
        dailySupplySideRevenue: dailySSRev.toString(),
        totalSupplySideRevenue: totalSSRev.toString(),
        dailyHoldersRevenue: '0',
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
        fetch: graphs(endpoints)(ETHEREUM),
        start: 1608354000,
        meta: {
          methodology: {
            UserFees: "Lido takes 10% fee on users staking rewards",
            Fees: "Staking rewards earned by all staked ETH",
            Revenue: "Staking rewards",
            ProtocolRevenue: "Lido applies a 10% fee on staking rewards that are split between node operators and the DAO Treasury",
            SupplySideRevenue: "Staking rewards earned by stETH holders"
          }
        }
    },
  }
}

export default adapter;
