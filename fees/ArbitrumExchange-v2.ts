
import adapter from '../dexs/ArbitrumExchange'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  methodology: {
    UserFees: "User pays 0.25% fees on each swap.",
    ProtocolRevenue: "No protocol revenue.",
    SupplySideRevenue: "LPs have no revenue.",
    HoldersRevenue: "ARX stakers receive all fees."
  },
  adapter: breakdown['v2'],
}