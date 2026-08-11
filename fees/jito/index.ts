/*
  Source:
  - dailyFees: fee accured to the jito DAO (JitoSOL Stake Pool Fees, Interceptor Fees, Tip Router Fees).
  - dailyRevenue/dailyProtocolRevenue: Represents fees accruing specifically to the Jito DAO Treasury.
    This includes:
      - JitoSOL Stake Pool Fees: rewards fee (4% of staking rewards, counted here instead of in the
        jito-staked-sol adapter to avoid double counting on the parent protocol), withdrawal fees
        (0.1% on unstake) and orphaned account fees, all minted to the stake pool fee account.
      - Interceptor Fees (a portion of MEV rewards directed to the DAO).
      - Tip Router Fees (MEV tips explicitly routed to the DAO).
      - JIP-24 the Block Engine and future fees from the newly launched BAM (Block Assembly Marketplace) are combined and routed to the DAO treasury.
      // https://forum.jito.network/t/jip-24-jito-dao-receives-all-jito-block-engine-fees-and-future-bam-fees/860
    This is calculated via the SQL query which sums transfers to specific DAO fee accounts.
  Note: The staking rewards distributed to JitoSOL holders (the other 96%) are not included in these metrics.
*/

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune"

const fetch = async (options: FetchOptions) => {

  const sql = getSqlFromFile("helpers/queries/jito.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const fees: any[] = (await queryDuneSql(options, sql));

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('jito-staked-sol', fees[0].jitostake_pool_fees, 'JITOSOL_FEES')
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
      'JITOSOL_FEES': 'JitoSOL stake pool fees: rewards fee (4% of staking rewards), withdrawal fees (0.1% on unstake) and orphaned account fees',
      'INTERCEPTOR_FEES': 'Fees generated from early unstake claims',
      'TIP_ROUTER': 'Fees generated from the TipRouter Node Consensus Network',
      'MEV_TIPS': 'Block engine fees routed directly to the DAO',
    }
  },
  methodology: {
    Fees: 'Fee accrued to the Jito DAO (JitoSOL Stake Pool Fees including 4% of staking rewards, Interceptor Fees, Tip Router Fees, BAM Fees)',
    Revenue: 'Fee accrued to the Jito DAO (JitoSOL Stake Pool Fees including 4% of staking rewards, Interceptor Fees, Tip Router Fees, BAM Fees)',
    ProtocolRevenue: 'Fee accrued to the Jito DAO (JitoSOL Stake Pool Fees including 4% of staking rewards, Interceptor Fees, Tip Router Fees, BAM Fees)',
    HoldersRevenue: 'Fee paid to token holders',
  }
}

export default adapter
