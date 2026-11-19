import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { httpGet } from "../utils/fetchURL"

// Roulana (https://roulana.com): one live European roulette table on Solana. Every round with money on it is drawn
// and paid by the table's program (https://github.com/roulana/program); players bet USDC from their own wallet.
// On Solana:
//   program  7FqVwLDtBPC1YsKpiXUw8HxCJP63hqQKGFcnYXgYgHBn (the table's program, verified build)
//   table    AfyXCSmsshBZ998TCCNbuUSB5hcw4RnJFeEk1LWhh63J (its Table account: the bank, the fee rate)
//   vault    BPJmrTZFCBi4iK6bA4FxV43wM1qQqiHXBGMHbfd4aw56 (the USDC the TVL adapter counts)
//   fees     the service fee goes to the table's owner wallet 8K7acNB8rubHNfqoMyF4v8pKkzxwmZ4qJWZBQJ5QSXCH; the buyback half
//            to 3nzTjSv6pf5n3mexQbV7wnRNkFeCdMUWXbedRFNwFDmy, collected by the buyback wallet 6Pcucyd1iNtxYH2YmKw3vcC62L8iyaN7AhoH5oCALF9V
// The table's public feed gives one UTC day of those rounds with each wallet's stakes and payouts in dollars
// (https://roulana.com/api/day, documented at https://roulana.com/developers). The same rounds are there one by one
// with every bet (https://roulana.com/api/history, /api/rounds/<number>), each with its Solana round account and a
// link that checks it on chain (https://roulana.com/verify?round=<account>).
const API = "https://roulana.com/api/day"

// The table's own house players, which play with Roulana's money to test the table, are left out so that only real
// players are counted. They are listed openly at https://roulana.com/solana ("The house players").
const HOUSE_WALLETS = new Set([
  "GPMYmaNsmDRBbaVgnTexDU87YW8yRddgBqJmPCdoFP1q", // their hub
  "EryBft3kWALL5yVaKz1FyAT2Q4KF7p8SxSnGd8NmkoZf",
  "5pnrXUu6EX1EffhPEnBKodua5tYabUQXrD3cqGJ9sxHB",
  "7SPJZtRqo77yPndDDigvXMKBiu4ZUJvG5tTNT8EJQ5EL",
  "D75AHAzmXFfwb8LdTxbbzUDHtcR18LgW1cFjSd65Sm4e",
  "BS4LXymXhKH5eFsn6GpMydJNR1k8YP8AH57hqzam4d7v",
  "CRUGq5m7Jh7A1tYaHsWGWVLkTvpdXA7acCw4XPUyuUQB",
  "9LL3oimUt9MNj2897jgo1uMFNS73f785F4ZR2Lvuujtw",
  "CuMRNxZZNtj9FEKJAqJMPfQdvDZc8kDrgixDdapzMPpF",
])

// Roulana's own wallets, whose bets are the team's tests: also left out. The first is the table's owner wallet, which
// receives the service fee (named as "owner" at https://roulana.com/api/bank).
const ROULANA_WALLETS = new Set([
  "8K7acNB8rubHNfqoMyF4v8pKkzxwmZ4qJWZBQJ5QSXCH",
  "HRapDsydToWXpDi3wrYc1BKA4ZCuN2ToPduETNm9TqVF",
])

// The table's fee: 1 % of every stake (feeBps 100 in the program's Table account, https://roulana.com/api/bank),
// paid by the bank out of its edge; half is the service fee to Roulana, half funds the public buyback of $ROULANA.
// Unchanged since the table opened on 2026-10-01; a change of the rate would need a dated switch here.
const FEE_RATE = 0.01
const SERVICE_SHARE = 0.5

interface Day { date: string; rounds: number; players: { wallet: string; rounds: number; bet: number; paid: number }[] }

const fetch = async (options: FetchOptions) => {
  const day: Day = await httpGet(`${API}?date=${options.dateString}`)
  let staked = 0, paid = 0
  for (const p of day.players) {
    if (HOUSE_WALLETS.has(p.wallet) || ROULANA_WALLETS.has(p.wallet)) continue
    staked += p.bet
    paid += p.paid
  }
  const fee = staked * FEE_RATE

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  dailyVolume.addUSDValue(staked, "Stakes")
  dailyFees.addUSDValue(staked - paid, "Gross Gaming Revenue")
  dailySupplySideRevenue.addUSDValue(staked - paid - fee, "Gross Gaming Revenue To Bank Investors")
  dailyProtocolRevenue.addUSDValue(fee * SERVICE_SHARE, "Service Fee To Treasury")
  dailyHoldersRevenue.addUSDValue(fee * (1 - SERVICE_SHARE), "Buyback Fee To Token Holders")

  const dailyRevenue = dailyProtocolRevenue.clone()
  dailyRevenue.addBalances(dailyHoldersRevenue)

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
}

const adapter: SimpleAdapter = {
  // the source is one UTC day at a time
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-01",
  // a casino's gross gaming revenue is below zero on a day the players win more than they lose, and the bank
  // investors' part then also pays the day's fee
  allowNegativeValue: true,
  methodology: {
    Volume: "USDC staked by real players in rounds with money on them; the table's own house players and Roulana's own wallets are left out.",
    Fees: "Gross gaming revenue: what real players staked minus what they were paid.",
    Revenue: "The table's 1% fee on every stake, paid by the bank out of its edge.",
    SupplySideRevenue: "The gross gaming revenue less the fee, which stays with the bank's investors.",
    ProtocolRevenue: "Half of the fee: the service fee to Roulana.",
    HoldersRevenue: "Half of the fee: it funds the public buyback of $ROULANA (half burned, half to the daily prizes).",
  },
  breakdownMethodology: {
    Volume: { "Stakes": "USDC staked by real players." },
    Fees: { "Gross Gaming Revenue": "Real players' stakes minus their payouts." },
    Revenue: {
      "Service Fee To Treasury": "Half of the 1% fee, to Roulana.",
      "Buyback Fee To Token Holders": "Half of the 1% fee, to the $ROULANA buyback.",
    },
    SupplySideRevenue: { "Gross Gaming Revenue To Bank Investors": "Gross gaming revenue less the fee, kept by the bank's investors." },
    ProtocolRevenue: { "Service Fee To Treasury": "Half of the 1% fee, to Roulana." },
    HoldersRevenue: { "Buyback Fee To Token Holders": "Half of the 1% fee, to the $ROULANA buyback." },
  },
}

export default adapter
