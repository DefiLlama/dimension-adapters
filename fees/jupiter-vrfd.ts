import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryAllium } from "../helpers/allium"
import { getJupiterStatsRevenue } from "../helpers/jupiter-stats"

const VRFD_JUP_ACCOUNT = 'H9at42xAafMAYqWmL4sxX5EiUpECruvEsdsBc6uDJUtT'
const JUP_BURN_MULTISIG = '8gMBNeKwXaoNi9bhbVUWFt4Uc5aobL9PeYMXfYDMePE2'
const VRFD_SERVICE_WALLET = 'verGhDwWuLnSi43vaJcNsLPXBQnqgmtbYFEmmhiv96q'
const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
const LABEL = "Token Verification Fees"
const BURN_LABEL = "Retail Verification Fees Burned"

// Jupiter's stats API. Retail verifications are paid in JUP to the account above, owned by the JUP burn multisig
// above, in transactions paid for by the VRFD service wallet. That JUP is burned,
// so it is holders revenue. Enterprise verifications are included in USD.
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
  // Not subtracted from protocol revenue: the burned JUP is valued at the day's JUP price, not the price it was paid at.
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(1), dailyHoldersRevenue }
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
    ProtocolRevenue: "All verification fees, kept by Jupiter.",
    HoldersRevenue: "Retail verification fees, paid in JUP that is burned.",
  },
  breakdownMethodology: {
    Fees: { [LABEL]: "Fees paid for token verification and metadata updates." },
    Revenue: { [LABEL]: "Fees paid for token verification and metadata updates." },
    ProtocolRevenue: { [LABEL]: "Fees paid for token verification and metadata updates." },
    HoldersRevenue: { [BURN_LABEL]: "Retail verification fees, paid in JUP that is burned." },
  },
}

export default adapter
