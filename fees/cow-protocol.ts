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
  // console.log(preFetchedResults);
  const dune_chain = options.chain === CHAIN.XDAI ? 'gnosis' : options.chain;
  const data = preFetchedResults.find((result: any) => result.chain === dune_chain);

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (data) {
    let df = (data.protocol_fee || 0) + (data.partner_fee || 0) + (data.mev_blocker_fee || 0);
    let protocolRevenue = (data.protocol_fee || 0) + (data.mev_blocker_fee || 0);
    if(options.chain === CHAIN.XDAI && df > 5) {
      throw new Error(`PaF ${df}, PrF ${protocolRevenue}, P ${data.partner_fee}, Pr ${data.protocol_fee}, M ${data.mev_blocker_fee} very high for gnosis`);
      // df = 0;
      // protocolRevenue = 0;
    }
    dailyFees.addCGToken('ethereum', df);
    dailyProtocolRevenue.addCGToken('ethereum', protocolRevenue);
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
  UserFees: "All trading fees including protocol fees, partner fees, and MEV blocker fees",
  Fees: "All trading fees including protocol fees, partner fees, and MEV blocker fees",
  Revenue: "Trading fees excluding partner fee share (protocol fees + MEV blocker fees)",
  ProtocolRevenue: "Trading fees excluding partner fee share (protocol fees + MEV blocker fees)",
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
      start: '2024-05-20',
      meta: {
        methodology
      }
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-12-02',
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
