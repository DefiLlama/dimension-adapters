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
  - dailyFees: Staking rewards (proportional share) + TipRouter NCN rewards + withdrawal fees
  - dailyRevenue/dailyProtocolRevenue: Kyros share of withdrawal fees (0.1% of 0.2% total)
  - dailySupplySideRevenue: Staking rewards + TipRouter NCN rewards distributed to holders

  Fee Structure:
  - Deposits: Free
  - Withdrawals: 0.2% fee (0.1% to Kyros, 0.1% to Jito DAO)

  Staking Rewards Calculation:
  - Kyros holds JitoSOL in vaults (doesn't have direct stake accounts)
  - We use RPC to get Kyros's JitoSOL balance and total supply 
  - We use Dune to get total staking rewards (sol-lst pattern)
  - Formula: (kyros_jitosol_balance / total_jitosol_supply) * daily_jitosol_staking_rewards

  Sources:
  - Documentation: https://docs.kyros.fi/
  - TipRouter: https://docs.jito.network/restaking/ncn/tiprouter
*/

import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getSqlFromFile, queryDuneSql } from '../../helpers/dune'
import { METRIC } from '../../helpers/metrics'
import { getTokenBalance, getTokenSupply } from '../../helpers/solana'
import ADDRESSES from '../../helpers/coreAssets.json'

const KYROS_ADDRESSES = {
  MAIN_AUTHORITY: '42iznAJXXefUPmnYz6N6GCzFvXG42o3oTd2D1ymH4UmX',

  KYSOL_VAULT: 'CQpvXgoaaawDCLh8FwMZEwQqnPakRUZ5BnzhjnEBPJv',
  KYJTO_VAULT: 'ABsoYTwRPBJEf55G7N8hVw7tQnDKBA6GkZCKBVrjTTcf',
  KYKYROS_VAULT: '8WgP3NgtVWLFuSzCk7aBz7FLuqEpcJwRPhkNJ5PnBTsV',

  TIP_ROUTER: 'RouterBmuRBkPUbgEDMtdvTZ75GBdSREZR5uGUxxxpb',
  JITO_RESTAKING: 'RestkWeAVL8fRGgzhfeoqFhsqKRchg6aa1XrcH96z4Q',
}

const JITOSOL_MINT = ADDRESSES.solana.JitoSOL

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const [kyrosJitosolBalance, jitosolTotalSupply] = await Promise.all([
    getTokenBalance(JITOSOL_MINT, KYROS_ADDRESSES.KYSOL_VAULT),
    getTokenSupply(JITOSOL_MINT),
  ])

  const kyrosShare = jitosolTotalSupply > 0 ? kyrosJitosolBalance / jitosolTotalSupply : 0

  const sql = getSqlFromFile('helpers/queries/kyros.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp,
    main_authority: KYROS_ADDRESSES.MAIN_AUTHORITY,
    kysol_vault: KYROS_ADDRESSES.KYSOL_VAULT,
    kyjto_vault: KYROS_ADDRESSES.KYJTO_VAULT,
    kykyros_vault: KYROS_ADDRESSES.KYKYROS_VAULT,
    tip_router: KYROS_ADDRESSES.TIP_ROUTER,
    jito_restaking: KYROS_ADDRESSES.JITO_RESTAKING,
  })

  const results: any[] = await queryDuneSql(options, sql)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const row of results) {
    const { source, mint, amount } = row

    if (source === 'staking') {
      // Total Jito staking rewards - apply Kyros's proportional share
      // amount is in SOL, kyrosShare is the fraction
      const kyrosStakingRewards = amount * kyrosShare
      if (kyrosStakingRewards > 0) {
        dailySupplySideRevenue.addCGToken('solana', kyrosStakingRewards, METRIC.STAKING_REWARDS)
        dailyFees.addCGToken('solana', kyrosStakingRewards, METRIC.STAKING_REWARDS)
      }
    } else if (source === 'protocol') {
      // Kyros share of withdrawal fees (0.1% of 0.2% total) goes to protocol revenue
      dailyRevenue.add(mint, amount, METRIC.DEPOSIT_WITHDRAW_FEES)
      dailyFees.add(mint, amount, METRIC.DEPOSIT_WITHDRAW_FEES)
    } else if (source === 'tip_router') {
      // TipRouter NCN rewards (restaking rewards)
      dailySupplySideRevenue.add(mint, amount, METRIC.MEV_REWARDS)
      dailyFees.add(mint, amount, METRIC.MEV_REWARDS)
    } else if (source === 'restaking') {
      // Other restaking rewards from NCN operators
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
  Fees: 'Staking rewards (proportional share based on JitoSOL holdings) + TipRouter NCN rewards + withdrawal fees.',
  Revenue: 'Withdrawal fees (0.1% of 0.2% total) collected when users unstake ky-tokens.',
  ProtocolRevenue: 'Withdrawal fees (0.1% of 0.2% total) collected when users unstake ky-tokens.',
  SupplySideRevenue:
    'Staking rewards + TipRouter NCN rewards distributed to kySOL, kyJTO, and kyKYROS holders.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]:
      'Proportional share of JitoSOL staking rewards (inflation + MEV) based on Kyros vault holdings.',
    [METRIC.MEV_REWARDS]: 'TipRouter NCN rewards (0.15% of MEV tips) distributed to Kyros vaults.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Kyros share of withdrawal fees (0.1% of 0.2% total fee).',
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]:
      'Proportional share of JitoSOL staking rewards distributed to LRT holders.',
    [METRIC.MEV_REWARDS]: 'TipRouter NCN rewards distributed to LRT holders.',
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
