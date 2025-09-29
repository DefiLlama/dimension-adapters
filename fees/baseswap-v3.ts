
import adapter from '../dexs/baseswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  methodology: {
    UserFees:
      "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
    SupplySideRevenue: "LPs receive 36% of the current swap fee",
    ProtocolRevenue: "Treasury receives 64% of each swap",
    Fees: "All fees come from the user.",
  },
  adapter: breakdown['v3'],
}