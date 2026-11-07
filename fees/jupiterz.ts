import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getJupiterStatsRevenue, JUPITER_STATS_API_START } from "../helpers/jupiter-stats"
import { JUPITER_METRICS, JUP_TREASURY_SHARE } from "./jupiter"

// Jupiter's stats API. JupiterZ RFQ fills settle through RderEngine111111111111111111111111111111112. Market makers pay a
// fee built into their quote and settled offchain; takers on v2 pay a fee that lands in the Jupiter fee authorities.
const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue } = await getJupiterStatsRevenue(options, { jupiterz: JUPITER_METRICS.JupiterZFees })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(JUP_TREASURY_SHARE) }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: JUPITER_STATS_API_START,
  methodology: {
    Fees: 'Fees on JupiterZ RFQ fills, charged to market makers and, on v2, to takers.',
    Revenue: 'All JupiterZ fees, kept by Jupiter.',
    ProtocolRevenue: "Half of JupiterZ fees, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
  },
  breakdownMethodology: {
    Fees: { [JUPITER_METRICS.JupiterZFees]: 'Fees on JupiterZ RFQ fills, charged to market makers and, on v2, to takers.' },
    Revenue: { [JUPITER_METRICS.JupiterZFees]: 'All JupiterZ fees, kept by Jupiter.' },
    ProtocolRevenue: { [JUPITER_METRICS.JupiterZFees]: "Half of JupiterZ fees, kept by the treasury." },
  },
}

export default adapter
