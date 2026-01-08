import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

const adapter: SimpleAdapter = uniV3Exports({
  [CHAIN.HYPERLIQUID]: {
    factory: '0x1Cd8363DfAdA19911f745BA984fce02b42c943bF',
    userFeesRatio: 1,
    revenueRatio: 0.143,
    protocolRevenueRatio: 0.143,
  },
})

adapter.methodology = {
  Fees: "Users pay trade fees on each swap.",
  UserFees: "Users pay trade fees on each swap.",
  Revenue: "Protocol receives 14.3% of trade fees.",
  ProtocolRevenue: "Protocol receives 14.3% of trade fees.",
  SupplySideRevenue: "Liquidity providers get 85.7% of trade fees.",
}

export default adapter;
