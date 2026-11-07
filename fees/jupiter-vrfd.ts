import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryAllium } from "../helpers/allium"
import { getJupiterStatsRevenue } from "../helpers/jupiter-stats"
import { JUP_TREASURY_SHARE } from "./jupiter";

const VRFD_JUP_ACCOUNT = 'H9at42xAafMAYqWmL4sxX5EiUpECruvEsdsBc6uDJUtT'
const JUP_BURN_MULTISIG = '8gMBNeKwXaoNi9bhbVUWFt4Uc5aobL9PeYMXfYDMePE2'
const VRFD_SERVICE_WALLET = 'verGhDwWuLnSi43vaJcNsLPXBQnqgmtbYFEmmhiv96q'
const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
const LABEL = "Token Verification Fees"
const BURN_LABEL = "Retail Verification Fees Burned"

// Jupiter's stats API for the total. Retail verifications are paid in JUP to the account above, owned by the JUP burn
// multisig, in transactions paid for by the VRFD service wallet; that JUP is burned in batches (the account held 323.5k JUP
// on 2026-11-07), so it is holders revenue. Enterprise verifications are not paid in JUP and stay with Jupiter: in October
// 2026 retail was 105,150 JUP ($33.1k) of the API's $42.2k, enterprise the other ~$9.1k.
const fetch = async (options: FetchOptions) => {
  const [{ dailyFees, dailyRevenue }, [row]] = await Promise.all([
    getJupiterStatsRevenue(options, { vrfd: LABEL }),
    queryAllium(`
      SELECT
        (SELECT COALESCE(SUM(raw_amount), 0)
          FROM solana.assets.transfers
          WHERE to_address IN ('${JUP_BURN_MULTISIG}', '${VRFD_JUP_ACCOUNT}')
            AND signer = '${VRFD_SERVICE_WALLET}'
            AND mint = '${JUP_MINT}'
            AND type IN ('transfer', 'transferChecked')
            AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
            AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})) AS amount,
        (SELECT MIN(block_timestamp)
          FROM solana.assets.transfers
          WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
            AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed_past_end
    `),
  ])
  if (!row) throw new Error(`VRFD: no Allium result for ${options.dateString}`)
  if (!row.indexed_past_end) throw new Error(`VRFD: Allium is not indexed through ${options.dateString} yet`)

  const dailyHoldersRevenue = options.createBalances()
  dailyHoldersRevenue.add(JUP_MINT, row.amount, BURN_LABEL)
  // Enterprise fees = API total minus the retail JUP; floored at 0 because the retail JUP is valued at the day's price,
  // which can differ slightly from the price the API booked it at on a retail-only day.
  const enterpriseUsd = Math.max(0, await dailyRevenue.getUSDValue() - await dailyHoldersRevenue.getUSDValue())
  const dailyProtocolRevenue = options.createBalances()
  dailyProtocolRevenue.addUSDValue(enterpriseUsd * JUP_TREASURY_SHARE, LABEL)
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-01-01',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Fees paid for token verification and metadata updates, retail and enterprise.",
    Revenue: "All verification fees, kept by Jupiter.",
    ProtocolRevenue: "Half of enterprise verification fees, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
    HoldersRevenue: "Retail verification fees, paid in JUP to a burn account and burned in batches.",
  },
  breakdownMethodology: {
    Fees: { [LABEL]: "Fees paid for token verification and metadata updates." },
    Revenue: { [LABEL]: "Fees paid for token verification and metadata updates." },
    ProtocolRevenue: { [LABEL]: "Half of enterprise verification fees, kept by the treasury." },
    HoldersRevenue: { [BURN_LABEL]: "Retail verification fees, paid in JUP to a burn account and burned in batches." },
  },
}

export default adapter
