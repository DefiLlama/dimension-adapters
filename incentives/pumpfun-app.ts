import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// pump.fun pays its app rewards (Callout Rewards and referral rewards) in USDC from this wallet,
// which also collects the Platform Fee counted in fees/pumpfun-app.ts. First payout 2026-08-25.
const REWARDS_WALLET = 'BNrYNyQZhdGRs8Rvi98WGTjhxab2wFTdGtVjW72RGyh4'

const LABEL = 'App Rewards'

const fetch = async (options: FetchOptions) => {
  const rows = await queryDuneSql(options, `
    SELECT CAST(SUM(amount) AS double) AS amount
    FROM tokens_solana.transfers
    WHERE from_owner = '${REWARDS_WALLET}'
      AND to_owner <> '${REWARDS_WALLET}'
      AND token_mint_address = '${ADDRESSES.solana.USDC}'
      AND TIME_RANGE
  `)
  // rewards are paid in a daily batch, so an empty day means the source is lagging
  if (rows[0]?.amount == null) throw new Error(`No pump.fun reward payouts found for ${options.dateString}`)

  const tokenIncentives = options.createBalances()
  tokenIncentives.add(ADDRESSES.solana.USDC, rows[0].amount, LABEL)
  return { tokenIncentives }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-08-25',
  dependencies: [Dependencies.DUNE],
  methodology: {
    TokenIncentives: 'USDC rewards pump.fun pays to app users (Callout Rewards and referral rewards).',
  },
  breakdownMethodology: {
    TokenIncentives: {
      [LABEL]: 'Callout Rewards and referral rewards paid in USDC to pump.fun app users.',
    },
  },
}

export default adapter
