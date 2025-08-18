/*
  Source:
  - dailyFees: fee accured to the jito DAO (Withdrawal Fees, Interceptor Fees, Tip Router Fees).
  - dailyRevenue/dailyProtocolRevenue: Represents fees accruing specifically to the Jito DAO Treasury.
    This includes:
      - Withdrawal Fees (0.1% on unstake) from the JitoSOL stake pool.
      - Interceptor Fees (a portion of MEV rewards directed to the DAO).
      - Tip Router Fees (MEV tips explicitly routed to the DAO).
    This is calculated via the SQL query which sums transfers to specific DAO fee accounts.
  Note: Staking rewards distributed to JitoSOL holders are not included in these metrics.
*/

import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune"

const fetchFees = async (_a: any, _b: any, options: FetchOptions) => {

  const sql = getSqlFromFile("helpers/queries/jito.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const fees: any[] = (await queryDuneSql(options, sql));

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addCGToken('usd', fees[0].total_usd_amt)

  return {
    dailyFees: dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue: "0",
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: '2022-11-21',
    }
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Fee accured to the jito DAO (Withdrawal Fees, Interceptor Fees, Tip Router Fees)',
    Revenue: 'Fee accured to the jito DAO (Withdrawal Fees, Interceptor Fees, Tip Router Fees)',
    HoldersRevenue: 'Fee paid to token holders',
  }
}

export default adapter
