
import adapter from '../dexs/quickswap'
const { breakdown,  ...rest } = adapter

const methodologyV3 = {
  UserFees: "User pays dynamic fees on each swap based on pool settings (typically 0.01% to 1%).",
  Fees: "Dynamic fees are collected on each swap based on pool configuration",
  Revenue: "Protocol takes 15% of collected fees (current). Historical: 10% before March 2025, 10% on uni forks like IMX.",
  ProtocolRevenue: "Foundation receives 3.23% of collected fees (current). Historical: 1.7% before March 2025, 3% on uni forks.",
  SupplySideRevenue: "85% of collected fees go to liquidity providers (90% on uni forks like IMX).",
  HoldersRevenue: "Community receives 10% of collected fees for buybacks (current). Historical: 6.8% before March 2025, 7% on uni forks.",
};

export default {
  ...rest,
  adapter: breakdown['v3'],
  methodology: methodologyV3,
}