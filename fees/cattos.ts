import { FetchOptions, FetchResult, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (_1: any, _2: any, options: FetchOptions): Promise<FetchResult> => {
  const query = `
    SELECT
     SUM(CAST(json_extract_scalar(data, '$.total_apt_cost') AS DOUBLE) / 100000000) AS total_rev
      FROM aptos.events AS e
      WHERE 
        e.event_type LIKE '0x664f1da7f6256b26a7808e0e5b02e747c4c6450e92b602740a2a5514bba91e52::%::%'
        AND e.block_date >= from_unixtime(${options.startTimestamp})
        AND e.block_date <= from_unixtime(${options.endTimestamp})
  `
  const chainData = await queryDuneSql(options, query)
  const dailyFees = options.createBalances()
  dailyFees.addCGToken('aptos', chainData[0]["total_rev"])

  return { dailyFees, dailyRevenue: dailyFees, };
};

const adapter: any = {
  version: 1,
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: '2025-07-21',
    }
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'APT collected from selling chests.',
    Revenue: 'APT collected from selling chests.',
  }
};

export default adapter;
