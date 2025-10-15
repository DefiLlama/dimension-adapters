import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const methodology = {
  Fees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  Revenue: "80% fees are collected as revenue.",
  ProtocolRevenue: "Revenue going to the protocol. 5% of collected fees. (is probably right because the distribution is dynamic.)",
  HoldersRevenue: "User fees are distributed among holders. 75% of collected fees. (is probably right because the distribution is dynamic.)",
  SupplySideRevenue: "20% of collected fees are distributed among LPs. (is probably right because the distribution is dynamic.)"
}

const adapter = uniV2Exports({
  [CHAIN.LINEA]: { factory: '0xAAA16c016BF556fcD620328f0759252E29b1AB57', revenueRatio: 0.8, userFeesRatio: 1, protocolRevenueRatio: 0.05, holdersRevenueRatio: 0.75 },
})

adapter.methodology = methodology;
export default adapter;
