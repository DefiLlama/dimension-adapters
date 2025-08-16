
import adapter from './quickswap'
const { breakdown,  ...rest } = adapter

const methodologyV2 = {
  UserFees: "User pays 0.3% fees on each swap.",
  Fees: "0.3% of each swap is collected as trading fees",
  Revenue: "Protocol takes 13.33% of collected fees (0.04% community + 0.01% foundation).",
  ProtocolRevenue: "Foundation receives 3.33% of collected fees (0.01% of swap volume).",
  SupplySideRevenue: "83.33% of collected fees go to liquidity providers (0.25% of swap volume).",
  HoldersRevenue: "Community receives 13.33% of collected fees for buybacks (0.04% of swap volume).",
};

export default {
  ...rest,
  adapter: breakdown['v2'],
  methodology: methodologyV2,
}