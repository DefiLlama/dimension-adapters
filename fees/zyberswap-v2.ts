
import adapter from '../dexs/zyberswap-v2'

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  Fees: "A 0.25% of each swap is collected as trading fees",
  Revenue:
    "Protocol receives 0.1% on each swap. A part is used to buyback and burn and a part is used to buy WETH and distribute to stakers.",
  ProtocolRevenue: "Protocol receives 0.1% on each swap.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Stakers receive WETH a part of protocol revenue.",
};
adapter.methodology = methodology;
export default adapter