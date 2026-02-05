import adapter from '../dexs/zyberswap-stable'

const methodologyStable = {
  UserFees: "User pays a 0.04% fee on each swap.",
  Fees: "A 0.04% of each swap is collected as trading fees",
  Revenue: "Protocol receives 0.02% of the swap fee",
  ProtocolRevenue: "Protocol receives 0.02% of the swap fee",
  SupplySideRevenue: "0.02% of the swap fee is distributed to LPs",
  HoldersRevenue:
    "A portion of the protocol fees is used to purchase WETH and distribute to stakers.",
};

adapter.methodology = methodologyStable;
export default adapter