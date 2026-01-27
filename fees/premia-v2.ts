
import adapter from './premia'
const { breakdown,  ...rest } = adapter

export default {
            methodology: {
              UserFees:
                "Traders pay taker fees on each trade up to 3% of the option premium.",
              ProtocolRevenue: "The protocol collects 20% of the taker fees.",
              SupplySideRevenue:
                "Liquidity providers earn revenue from market-making options.",
              HoldersRevenue: "vxPREMIA holders collect 80% of the taker fees.",
            },
  ...rest,
  adapter: breakdown['v2'],
}