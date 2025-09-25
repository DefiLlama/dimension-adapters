
import adapter from '../dexs/swapmode'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v2'],
  methodology: {
    UserFees: "User pays 0.3% fees on each swap.",
    SupplySideRevenue: "LPs receive 0.06% of each swap.",
    ProtocolRevenue: "Treasury receives 0.24% of each swap.",
    Revenue: "All revenue generated comes from user fees.",
    Fees: "All fees come from the user.",
  },
}