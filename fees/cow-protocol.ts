import { Adapter, Chain, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const prefetch = async (options: FetchOptions) => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
  // https://dune.com/queries/4736286
  const sql = getSqlFromFile("helpers/queries/cow-protocol.sql", {
    start: startOfDay
  });
  return await queryDuneSql(options, sql);
}

const fetch = async (_a: any, _ts: any, options: FetchOptions) => {
  const preFetchedResults = options.preFetchedResults || [];

  const data = preFetchedResults.find((result: any) => result.chain === options.chain);

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (data) {
    // Daily fees = all fees (Limit + Market + UI Fee + Partner Fee Share + MEV Blocker Fee)
    const totalFees = (data.limit || 0) + (data.market || 0) + (data.ui_fee || 0) + (data.partner_fee || 0) + (data.mev_blocker_fee || 0);
    const protocolRevenue = (data.limit || 0) + (data.market || 0) + (data.ui_fee || 0) + (data.mev_blocker_fee || 0);
    dailyFees.addGasToken(totalFees * 1e18);
    dailyProtocolRevenue.addGasToken(protocolRevenue * 1e18);
  } else { 
    throw new Error(`No data found for chain ${options.chain} on ${options.startOfDay}`);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  }
}


const methodology = {
  UserFees: "All trading fees including limit orders, market orders, UI fees, partner fees, and MEV blocker fees",
  Fees: "All trading fees including limit orders, market orders, UI fees, partner fees, and MEV blocker fees",
  Revenue: "Trading fees excluding partner fee share (limit orders + market orders + UI fees + MEV blocker fees)",
  ProtocolRevenue: "Trading fees excluding partner fee share (limit orders + market orders + UI fees + MEV blocker fees)",
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-02-03',
      meta: {
        methodology
      }
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-06-01',
      meta: {
        methodology
      }
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2025-01-15',
      meta: {
        methodology
      }
    },
    [CHAIN.XDAI]: {
      fetch,
      start: '2023-02-03',
      meta: {
        methodology
      }
    }
  },
  prefetch,
  isExpensiveAdapter: true,
}

export default adapter;
