import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getJupiterStatsRevenue } from "../helpers/jupiter-stats"
import { JUP_TREASURY_SHARE } from "./jupiter";

// Jupiter's stats API. Jupiter's share of JupUSD reserve yield is paid in USDtb to
// DKu1jCcDj6cBJ7eVFgXg9LodP4MhGzHAeCVu25j5Bibp from B3q4P4XSmycvoHLaiEjchsGDafFPhKokvHvNRuW29N1y.
const LABELS = {
  ReserveYield: 'JupUSD Reserve Yield And Mint Redeem Fees',
  ReserveYieldToJupiter: 'JupUSD Reserve Yield To Jupiter',
  ReserveYieldToOthers: 'JupUSD Reserve Yield To JupUSD Holders And Partners',
}

const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await getJupiterStatsRevenue(options, {
    jupusd: {
      fees: LABELS.ReserveYield,
      revenue: LABELS.ReserveYieldToJupiter,
      supplySide: LABELS.ReserveYieldToOthers,
    },
  })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(JUP_TREASURY_SHARE), dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-01-02',
  allowNegativeValue: true, // yield accrues daily and is settled with the partner weekly, so a settlement day can be negative
  methodology: {
    Fees: 'Yield earned on JupUSD reserves and fees paid to mint and redeem JupUSD, from Jupiter\'s stats API.',
    Revenue: 'Jupiter\'s share of JupUSD reserve yield, from Jupiter\'s stats API.',
    ProtocolRevenue: "Half of Jupiter's share of JupUSD reserve yield, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
    SupplySideRevenue: 'Reserve yield not kept by Jupiter, and mint and redeem fees, which stay in the reserves.',
  },
  breakdownMethodology: {
    Fees: { [LABELS.ReserveYield]: 'Yield earned on JupUSD reserves and fees paid to mint and redeem JupUSD.' },
    Revenue: { [LABELS.ReserveYieldToJupiter]: 'Jupiter\'s share of JupUSD reserve yield.' },
    ProtocolRevenue: { [LABELS.ReserveYieldToJupiter]: "Half of Jupiter's share of JupUSD reserve yield, kept by the treasury." },
    SupplySideRevenue: { [LABELS.ReserveYieldToOthers]: 'Reserve yield not kept by Jupiter, and mint and redeem fees, which stay in the reserves.' },
  },
}

export default adapter
