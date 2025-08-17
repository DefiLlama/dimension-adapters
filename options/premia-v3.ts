
import adapter from './premia'
const { breakdown, ...rest } = adapter

export default {
  ...rest,
  methodology: {
    UserFees:
      "Traders pay taker fees on each trade up to 3% of the option premium.",
    ProtocolRevenue: "The protocol collects 10% of the taker fees.",
    SupplySideRevenue:
      "Liquidity providers collect 50% of the taker fees and earn revenue from market-making options.",
    HoldersRevenue: "vxPREMIA holders collect 40% of the taker fees.",
  },
  adapter: breakdown['v3'],
}