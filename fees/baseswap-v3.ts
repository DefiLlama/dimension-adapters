import { METRIC } from "../helpers/metrics";
import adapter from '../dexs/baseswap'
const { breakdown,  ...rest } = adapter

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Variable swap fees paid by users on each trade, ranging from 0.008% to 1% depending on the pool. According to protocol design, 36% goes to LPs and 64% to treasury, though revenue split is not tracked in current implementation.',
  }
};

export default {
  ...rest,
  methodology: {
    UserFees:
      "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
    SupplySideRevenue: "LPs receive 36% of the current swap fee",
    ProtocolRevenue: "Treasury receives 64% of each swap",
    Fees: "All fees come from the user.",
  },
  breakdownMethodology,
  adapter: breakdown['v3'],
}