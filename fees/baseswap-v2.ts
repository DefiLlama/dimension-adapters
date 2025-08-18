
import adapter from '../dexs/baseswap'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  methodology: {
    UserFees: "User pays 0.25% fees on each swap.",
    SupplySideRevenue: "LPs receive 0.17% of each swap.",
    ProtocolRevenue: "Treasury receives 0.08% of each swap.",
    Revenue: "All revenue generated comes from user fees.",
    Fees: "All fees come from the user.",
  },
  adapter: breakdown['v2'],
}