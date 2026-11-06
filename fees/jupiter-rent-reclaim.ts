import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getJupiterStatsRevenue } from "../helpers/jupiter-stats"

// Jupiter's stats API. Jupiter closes empty token accounts for users and keeps 2% of the rent returned; closes are
// signed by the relayers gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB and gasRUwwGJ7cVCnL675tT51mHUVCQxbVdMX7PL326hPT.
const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue } = await getJupiterStatsRevenue(options, {
    rent_reclaim: "Rent Reclaim Fees",
  })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(1) }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-01-02',
  methodology: {
    Fees: "Jupiter's 2% cut of the rent returned to users when their empty token accounts are closed.",
    Revenue: "All rent reclaim fees, kept by Jupiter.",
    ProtocolRevenue: "All rent reclaim fees, kept by Jupiter.",
  },
  breakdownMethodology: {
    Fees: { "Rent Reclaim Fees": "Jupiter's 2% cut of the rent returned when empty token accounts are closed." },
    Revenue: { "Rent Reclaim Fees": "Jupiter's 2% cut of the rent returned when empty token accounts are closed." },
    ProtocolRevenue: { "Rent Reclaim Fees": "Jupiter's 2% cut of the rent returned when empty token accounts are closed." },
  },
}

export default adapter
