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

const STAKE_POOL_RESERVE_ACCOUNT = "BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL";
const JITO_STAKE_POOL_AUTHORITY = "6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS";

const fetchFees = async (_a: any, _b: any, options: FetchOptions) => {

  const feeQuery = getSqlFromFile("helpers/queries/solana-liquid-staking-fees.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_account: STAKE_POOL_RESERVE_ACCOUNT,
    authority: JITO_STAKE_POOL_AUTHORITY
  });
  const dailyFees = options.createBalances();
  const stake_rewards = await queryDuneSql(options, feeQuery);

  dailyFees.addCGToken("solana", stake_rewards[0].daily_yield != null ? stake_rewards[0].daily_yield : 0);

  const sql = getSqlFromFile("helpers/queries/jito.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const revenue: any[] = (await queryDuneSql(options, sql));

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addCGToken('usd', revenue[0].total_usd_amt)

  return {
    dailyFees,
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
      meta: {
        methodology: {
          Fees: 'Staking rewards from staked SOL on Jito staked solana',
          Revenue: 'Fee accured to the jito DAO (Withdrawal Fees, Interceptor Fees, Tip Router Fees)',
          HoldersRevenue: 'Fee paid to token holders',
        }
      }
    }
  },
  isExpensiveAdapter: true
}

export default adapter
