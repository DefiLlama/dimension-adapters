
import adapter from '../dexs/swapmode'
const { breakdown, ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v3'],

  methodology: {
    UserFees:
      "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
    SupplySideRevenue: "LPs receive 36% of the current swap fee",
    ProtocolRevenue: "Treasury receives 64% of each swap",
    Fees: "All fees come from the user.",
  }
}