/*
  Source:
  - dailyFees: fee accured to the jito DAO (Withdrawal Fees, Interceptor Fees, Tip Router Fees).
  - dailyRevenue/dailyProtocolRevenue: Represents fees accruing specifically to the Jito DAO Treasury.
    This includes:
      - Withdrawal Fees (0.1% on unstake) from the JitoSOL stake pool.
      - Interceptor Fees (a portion of MEV rewards directed to the DAO).
      - Tip Router Fees (MEV tips explicitly routed to the DAO).
      - JIP-24 the Block Engine and future fees from the newly launched BAM (Block Assembly Marketplace) are combined and routed to the DAO treasury.
      // https://forum.jito.network/t/jip-24-jito-dao-receives-all-jito-block-engine-fees-and-future-bam-fees/860
    This is calculated via the SQL query which sums transfers to specific DAO fee accounts.
  Note: Staking rewards distributed to JitoSOL holders are not included in these metrics.
*/

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  const sql = getSqlFromFile("helpers/queries/jito.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const fees: any[] = (await queryDuneSql(options, sql));

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('usd-coin', fees[0].jitostake_pool_fees, 'JITOSOL_FEES')
  dailyFees.addCGToken('usd-coin', fees[0].interceptor_fees, 'INTERCEPTOR_FEES')
  dailyFees.addCGToken('usd-coin', fees[0].tip_router_fees, 'TIP_ROUTER')
  dailyFees.addCGToken('usd-coin', fees[0].bam_mev_tips, 'MEV_TIPS')

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: "0",
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-11-21',
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  breakdownMethodology: {
    Fees: {
      'JITOSOL_FEES': 'Withdrawal Fees (0.1% on unstake) from the JitoSOL stake pool',
      'INTERCEPTOR_FEES': 'Fees generated from early unstake claims',
      'TIP_ROUTER': 'Fees generated from the TipRouter Node Consensus Network',
      'MEV_TIPS': 'Block engine fees routed directly to the DAO',
    }
  },
  methodology: {
    Fees: 'Fee accured to the jito DAO (Withdrawal Fees, Interceptor Fees, Tip Router Fees, BAM Fees)',
    Revenue: 'Fee accured to the jito DAO (Withdrawal Fees, Interceptor Fees, Tip Router Fees, BAM Fees)',
    ProtocolRevenue: 'Fee accured to the jito DAO (Withdrawal Fees, Interceptor Fees, Tip Router Fees, BAM Fees)',
    HoldersRevenue: 'Fee paid to token holders',
  }
}

export default adapter
