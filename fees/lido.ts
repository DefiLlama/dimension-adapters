import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('F7qb71hWab6SuRL5sf6LQLTpNahmqMsBnnweYHzLGUyG'),
}

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
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

  const graphRes = await request(endpoints[options.chain], graphQuery);

  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  dailyFees.addUSDValue(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD)
  dailySupplySideRevenue.addUSDValue(graphRes.financialsDailySnapshot.dailySupplySideRevenueUSD)
  const dailyRevenue = dailyFees.clone(0.1)

  return {
    dailyFees,
    dailyUserFees: 0,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2020-12-19',
    },
  },
  methodology: {
    Fees: "Staking rewards earned by all staked ETH",
    UserFees: "Lido takes no fees from users.",
    Revenue: "Lido applies a 10% fee on staking rewards that are split between node operators and the DAO Treasury",
    HoldersRevenue: "No revenue distributed to LDO holders",
    ProtocolRevenue: "Lido applies a 10% fee on staking rewards that are split between node operators and the DAO Treasury",
    SupplySideRevenue: "Staking rewards earned by stETH holders"
  },
}

export default adapter;
