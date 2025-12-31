/*
  Kyros - Liquid Restaking Protocol on Solana

  Kyros is built on Jito (Re)staking, offering liquid restaking tokens (kySOL, kyJTO, kyKYROS)
  that combine staking rewards, MEV rewards, and restaking rewards into a single token.

  Architecture:
  - Users deposit SOL/JitoSOL → receive kySOL
  - Users deposit JTO → receive kyJTO  
  - Users deposit KYROS → receive kyKYROS
  - Kyros delegates to Jito Restaking Vault → NCN operators (Kiln, Helius, Temporal, etc.)
  - TipRouter NCN distributes 0.15% of MEV tips to JitoSOL/JTO vault stakers

  Fee Sources:
  - dailyFees: TipRouter NCN rewards + Kyros withdrawal fees
  - dailyRevenue/dailyProtocolRevenue: Kyros share of withdrawal fees (0.1% of 0.2% total)
  - dailySupplySideRevenue: TipRouter NCN rewards distributed to kySOL/kyJTO/kyKYROS holders

  Fee Structure:
  - Deposits: Free
  - Withdrawals: 0.2% fee (0.1% to Kyros, 0.1% to Jito DAO)

  Note: Base JitoSOL staking rewards (inflation + MEV) are tracked by jito-staked-sol adapter.
  This adapter tracks ONLY restaking-specific rewards to avoid double counting.

  Sources:
  - Documentation: https://docs.kyros.fi/
  - TipRouter: https://docs.jito.network/restaking/ncn/tiprouter
*/

import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getSqlFromFile, queryDuneSql } from '../../helpers/dune'
import { METRIC } from '../../helpers/metrics'

// Kyros Program Addresses
const ADDRESSES = {
  // Main Authority (receives protocol fees)
  MAIN_AUTHORITY: '42iznAJXXefUPmnYz6N6GCzFvXG42o3oTd2D1ymH4UmX',

  // Kyros Vault addresses
  KYSOL_VAULT: 'CQpvXgoaaawDCLh8FwMZEwQqnPakRUZ5BnzhjnEBPJv',
  KYJTO_VAULT: 'ABsoYTwRPBJEf55G7N8hVw7tQnDKBA6GkZCKBVrjTTcf',
  KYKYROS_VAULT: '8WgP3NgtVWLFuSzCk7aBz7FLuqEpcJwRPhkNJ5PnBTsV',

  // Reward distribution programs
  TIP_ROUTER: 'RouterBmuRBkPUbgEDMtdvTZ75GBdSREZR5uGUxxxpb',
  JITO_RESTAKING: 'RestkWeAVL8fRGgzhfeoqFhsqKRchg6aa1XrcH96z4Q',
}

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const sql = getSqlFromFile('helpers/queries/kyros.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp,
    main_authority: ADDRESSES.MAIN_AUTHORITY,
    kysol_vault: ADDRESSES.KYSOL_VAULT,
    kyjto_vault: ADDRESSES.KYJTO_VAULT,
    kykyros_vault: ADDRESSES.KYKYROS_VAULT,
    tip_router: ADDRESSES.TIP_ROUTER,
    jito_restaking: ADDRESSES.JITO_RESTAKING,
  })

  const results: any[] = await queryDuneSql(options, sql)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const row of results) {
    const { source, mint, amount } = row

    if (source === 'protocol') {
      // Kyros share of withdrawal fees (0.1% of 0.2% total) goes to protocol revenue
      dailyRevenue.add(mint, amount, METRIC.DEPOSIT_WITHDRAW_FEES)
      dailyFees.add(mint, amount, METRIC.DEPOSIT_WITHDRAW_FEES)
    } else if (source === 'tip_router') {
      // TipRouter rewards go to supply side
      dailySupplySideRevenue.add(mint, amount, METRIC.MEV_REWARDS)
      dailyFees.add(mint, amount, METRIC.MEV_REWARDS)
    } else if (source === 'restaking') {
      // Other restaking rewards go to supply side
      dailySupplySideRevenue.add(mint, amount, METRIC.STAKING_REWARDS)
      dailyFees.add(mint, amount, METRIC.STAKING_REWARDS)
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'TipRouter NCN rewards distributed to Kyros vaults plus withdrawal fees. Note: Base JitoSOL staking rewards are tracked separately by jito-staked-sol adapter.',
  Revenue: 'Withdrawal fees (0.1% of 0.2% total) collected when users unstake ky-tokens.',
  ProtocolRevenue: 'Withdrawal fees (0.1% of 0.2% total) collected when users unstake ky-tokens.',
  SupplySideRevenue:
    'TipRouter NCN rewards (0.15% of MEV tips) distributed to kySOL, kyJTO, and kyKYROS holders.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MEV_REWARDS]: 'TipRouter NCN rewards (0.15% of MEV tips) distributed to Kyros vaults.',
    [METRIC.STAKING_REWARDS]: 'Other restaking rewards from NCN operators.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Kyros share of withdrawal fees (0.1% of 0.2% total fee).',
  },
  SupplySideRevenue: {
    [METRIC.MEV_REWARDS]: 'TipRouter NCN rewards distributed to LRT holders.',
    [METRIC.STAKING_REWARDS]: 'Restaking rewards distributed to LRT holders.',
  },
  Revenue: {
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Kyros share of withdrawal fees (0.1% of 0.2% total fee).',
  },
  ProtocolRevenue: {
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Kyros share of withdrawal fees (0.1% of 0.2% total fee).',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-10-29',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
}

export default adapter
