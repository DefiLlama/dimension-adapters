import { METRIC } from "../helpers/metrics";
import adapter from '../dexs/baseswap'
const { breakdown,  ...rest } = adapter

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  SupplySideRevenue: "LPs receive 0.17% of each swap.",
  ProtocolRevenue: "Treasury receives 0.08% of each swap.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees come from the user.",
};

const breakdownMethodology = {
  UserFees: {
    [METRIC.SWAP_FEES]: 'Users pay 0.25% fee on each swap transaction'
  },
  Fees: {
    [METRIC.SWAP_FEES]: 'Total swap fees collected from all trades, calculated as 0.25% of swap volume'
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Protocol treasury receives 0.08% of each swap (32% of total fees)'
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'Liquidity providers receive 0.17% of each swap (68% of total fees)'
  }
};

export default {
  ...rest,
  methodology,
  breakdownMethodology,
  adapter: breakdown['v2'],
}