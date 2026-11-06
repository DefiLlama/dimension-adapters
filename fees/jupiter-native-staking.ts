import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getJupiterStatsRevenue } from "../helpers/jupiter-stats"

// Jupiter's stats API. Vote accounts CatzoSMUkTRidT5DwBxAC2pEtnwMBTpkCepHkFgZDiqb and E5Y8uSQ8SWHH7GynZqMGirckAybkWXH5QcxtZ6tLezbn;
// priority fees land in FuRJUnsrqrp9yqnvn8wpKSMv8LbgpJME6g8R73T2Cz1C. Native stake only: JupSOL's stake is on the Jupiter
// Staked SOL listing. Stakers' inflation rewards are not counted.
const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await getJupiterStatsRevenue(options, {
    native_staking: { fees: "Native Staking Fees", revenue: "Native Staking Fees To Jupiter", supplySide: "Native Staking Fees To Stakers And Partners" },
  })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(1), dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-01-01',
  methodology: {
    Fees: "Fees earned by Jupiter's validators on native stake: inflation commission, priority fees and MEV passed to stakers. Stakers' inflation rewards are not counted.",
    Revenue: "Commission and priority fees kept by Jupiter.",
    ProtocolRevenue: "Commission and priority fees kept by Jupiter.",
    SupplySideRevenue: "MEV passed to stakers, and fees and commission paid to partners.",
  },
  breakdownMethodology: {
    Fees: { "Native Staking Fees": "Inflation commission and priority fees on native stake, and MEV passed to stakers." },
    Revenue: { "Native Staking Fees To Jupiter": "Commission and priority fees kept by Jupiter." },
    ProtocolRevenue: { "Native Staking Fees To Jupiter": "Commission and priority fees kept by Jupiter." },
    SupplySideRevenue: { "Native Staking Fees To Stakers And Partners": "MEV passed to stakers, and fees and commission paid to partners." },
  },
}

export default adapter
