import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { METRIC } from "../helpers/metrics";

const endpoint = sdk.graph.modifyEndpoint('4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a')


const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400)

  const graphQuery = gql
  `{
    financialsDailySnapshot(id: ${dateId}) {
        dailyTotalRevenueUSD
        dailyProtocolSideRevenueUSD
        dailySupplySideRevenueUSD
        cumulativeTotalRevenueUSD
        cumulativeProtocolSideRevenueUSD
        cumulativeSupplySideRevenueUSD
    }
  }`;

  const graphRes = await request(endpoint, graphQuery);

  const dailyFees = options.createBalances()
  dailyFees.addUSDValue(Number(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD), METRIC.BORROW_INTEREST)

  const dailyRevenue = options.createBalances()
  dailyRevenue.addUSDValue(Number(graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD), METRIC.BORROW_INTEREST)

  const dailySupplySideRevenue = options.createBalances()
  dailySupplySideRevenue.addUSDValue(Number(graphRes.financialsDailySnapshot.dailySupplySideRevenueUSD), METRIC.BORROW_INTEREST)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};


const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2019-05-07',
    },
  },
  methodology: {
    Fees: 'Total borrow interest paid by borrowers.',
    UserFees: 'Total borrow interest paid by borrowers.',
    Revenue: 'Share of borrow interest to Compound treasury.',
    ProtocolRevenue: 'Share of borrow interest to Compound treasury.',
    SupplySideRevenue: 'Total borrow interest paid to lenders.',
    HoldersRevenueRatio: 'No revenue share for COMP token holders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Total borrow interest paid by borrowers across all lending markets.',
    },
    UserFees: {
      [METRIC.BORROW_INTEREST]: 'Total borrow interest paid by borrowers across all lending markets.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol reserve factor portion of borrow interest retained by Compound treasury (typically 10% of total interest).',
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: 'Protocol reserve factor portion of borrow interest retained by Compound treasury (typically 10% of total interest).',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Lender portion of borrow interest distributed to cToken holders who supply liquidity (typically 90% of total interest).',
    },
  }
}

export default adapter;
