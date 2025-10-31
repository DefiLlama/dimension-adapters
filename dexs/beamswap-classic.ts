
import adapter from './beamswap'
const { breakdown, ...rest } = adapter

export default {
  ...rest,
  methodology: {
    UserFees: "User pays 0.30% fees on each swap.",
    Fees: "A 0.30% of each swap is collected as trading fees",
    Revenue: "Protocol receives 0.13% on each swap.",
    ProtocolRevenue: "Protocol receives 0.13% on each swap.",
    SupplySideRevenue: "All user fees are distributed among LPs.",
    HoldersRevenue: "Stakers received $GLINT in staking rewards.",
  },
  adapter: breakdown['classic'],
}