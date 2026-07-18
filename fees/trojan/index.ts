import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryAllium } from '../../helpers/allium'

// Trojan charges a 1% fee (0.9% with a referral) in SOL on every successful spot swap. Perps are
// routed to Hyperliquid and are out of scope here. The fee lands in one of six collector wallets
// (1 Telegram-bot wallet + 5 web-"Terminal" wallets). Those wallets then, in SOL:
//   - pay cashback / referral / jackpot rewards out to the trading users (thousands of small
//     transfers/day)  -> SupplySideRevenue
//   - sweep the remainder to the protocol treasury wallets                -> Revenue (kept)
const FEE_WALLETS = [
  '9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco', // Telegram bot fee wallet
  '92Med3qeK7duC5iiYsHX38H2f2twJfRsSx93oNrza2VH', // Terminal fee wallets
  '2jwHNxavSoMZMEDbT1eV9PcPt5dDcayCqM6MkgaPpmWQ',
  '65gDv7pZQCZELsNpNYSFEBtNFpWZAbxmRFB6BGMqFkHH',
  'BWgb8wR1FEGiu1jCDSKuHKf752W27b4iN6SvoNCiK4qp',
  '8jgg7moFJkHyTtAv9M6RBSPMp2oXeXhuiUMKW8YbYCWn',
]

// Protocol treasury/consolidation wallets. The fee wallets sweep their kept share here; each of
// these forwards onward to a single cold wallet, so sweeps to them are the protocol keeping its
// money (Revenue), not payouts to users.
const TREASURY_WALLETS = [
  'DrXMnPrFSiHA4JKKrSktTbAFrfvQCixHKvD7zGHxkzJP',
  '8bQaRpmZxPgCNg5o9F9NZfpzqGGfXem5gmbh1xm9jRAS',
]

const LABELS = {
  TRADING_FEES: 'Trading Fees',
  RETAINED: 'Trading Fees Retained By Protocol',
  PAYOUTS: 'Cashback / Referral / Jackpot Payouts',
} as const

const list = (a: string[]) => a.map((x) => `'${x}'`).join(', ')

const fetch = async (options: FetchOptions) => {
  const wallets = list(FEE_WALLETS)
  const nonUser = list([...FEE_WALLETS, ...TREASURY_WALLETS]) // fee wallets + treasury = not a user

  // Single scan over SOL transfers touching a fee wallet:
  //   gross_fees  = SOL into a fee wallet from outside the wallet/treasury cluster = the 1% charge
  //   supply_side = SOL out of a fee wallet to a user (any address that is not a fee/treasury wallet)
  const rows = await queryAllium(`
    SELECT
      SUM(CASE WHEN to_address IN (${wallets}) AND from_address NOT IN (${nonUser})
               THEN raw_amount ELSE 0 END) AS gross_fees,
      SUM(CASE WHEN from_address IN (${wallets}) AND to_address NOT IN (${nonUser})
               THEN raw_amount ELSE 0 END) AS supply_side
    FROM solana.assets.transfers
    WHERE block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND transfer_type = 'sol_transfer'
      AND mint = '${ADDRESSES.solana.SOL}'
      AND (to_address IN (${wallets}) OR from_address IN (${wallets}))
  `)

  const grossFees = Number(rows[0].gross_fees)
  const supplySide = Number(rows[0].supply_side)

  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()

  dailyFees.add(ADDRESSES.solana.SOL, grossFees, LABELS.TRADING_FEES)
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, supplySide, LABELS.PAYOUTS)
  dailyRevenue.add(ADDRESSES.solana.SOL, grossFees - supplySide, LABELS.RETAINED)

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const breakdownMethodology = {
  Fees: {
    [LABELS.TRADING_FEES]: 'The 1% fee (0.9% with a referral) Trojan charges in SOL on every successful spot swap.',
  },
  SupplySideRevenue: {
    [LABELS.PAYOUTS]: 'SOL paid back out to trading users: 20% cashback to all users, multi-level referral rewards, and the daily jackpot (10% of daily fees).',
  },
  Revenue: {
    [LABELS.RETAINED]: 'Trading fees Trojan keeps (swept to its treasury) after cashback, referral and jackpot payouts.',
  },
  ProtocolRevenue: {
    [LABELS.RETAINED]: 'Trading fees Trojan keeps (swept to its treasury) after cashback, referral and jackpot payouts.',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-04',
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'The 1% fee (0.9% with a referral) Trojan charges on every successful spot swap. Perps (routed to Hyperliquid) are not included.',
    Revenue: 'Trading fees Trojan keeps after cashback, referral and jackpot payouts.',
    ProtocolRevenue: 'Trading fees Trojan keeps after cashback, referral and jackpot payouts.',
    SupplySideRevenue: '20% cashback to all users, multi-level referral rewards, and the daily jackpot, all paid back to trading users.',
  },
  breakdownMethodology,
}

export default adapter
