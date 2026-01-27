
import adapter from './ArbitrumExchange'
const { breakdown, ...rest } = adapter

export default {
  ...rest,
  methodology: {
    UserFees: "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
    ProtocolRevenue: "No protocol revenue.",
    SupplySideRevenue: "LPs have no revenue.",
    HoldersRevenue: "ARX stakers receive all fees."
  },
  adapter: breakdown['v3'],
}