import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getJupiterStatsRevenue } from "../helpers/jupiter-stats"
import { JUP_TREASURY_SHARE } from "./jupiter";

// Jupiter's stats API: API subscriptions paid onchain or by card, enterprise agreements, and Jupiter's share of integrator fees.
const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue } = await getJupiterStatsRevenue(options, {
    developer_platform: "Developer Platform Fees",
  })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(JUP_TREASURY_SHARE) }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-03-31',
  methodology: {
    Fees: "Fees developers pay for Jupiter API access, and Jupiter's share of fees settled for integrators.",
    Revenue: "All Developer Platform fees, kept by Jupiter.",
    ProtocolRevenue: "Half of Developer Platform fees, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
  },
  breakdownMethodology: {
    Fees: { "Developer Platform Fees": "Fees developers pay for Jupiter API access, and Jupiter's share of fees settled for integrators." },
    Revenue: { "Developer Platform Fees": "Fees developers pay for Jupiter API access, and Jupiter's share of fees settled for integrators." },
    ProtocolRevenue: { "Developer Platform Fees": "Half of Developer Platform fees, kept by the treasury." },
  },
}

export default adapter
