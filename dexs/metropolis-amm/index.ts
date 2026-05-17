import { uniV2Exports } from "../../helpers/uniswap";

const methodology = {
  Fees: "0.3% of the trading volume",
  Revenue: "40% of the swap fees",
  ProtocolRevenue: "10% of the swap fees",
  SupplySideRevenue: "60% of the swap fees",
  HoldersRevenue: "30% of the swap fees",
};

const adapter = uniV2Exports({
  sonic: {
    factory: "0x1570300e9cFEC66c9Fb0C8bc14366C86EB170Ad0",
    fees: 0.003,
    userFeesRatio: 1,
    revenueRatio: 0.4,
    holdersRevenueRatio: 0.3,
    protocolRevenueRatio: 0.1,
    start: "2024-12-16",
  },
});

adapter.methodology = methodology;

export default adapter;
