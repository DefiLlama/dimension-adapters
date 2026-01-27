
import adapter from './swapbased'
const { breakdown, ...rest } = adapter

export default {
  ...rest,
  adapter: breakdown['v2'],
  methodology: {
    UserFees: "User pays 0.30% fees on each swap.",
    SupplySideRevenue: "LPs receive 0.25% of each swap.",
    ProtocolRevenue: "Treasury receives 0.05% of each swap.",
    Revenue: "All revenue generated comes from user fees.",
    Fees: "All fees comes from the user.",
  },
}