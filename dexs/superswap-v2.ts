import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "User pays 0.3% fees on each swap.",
    UserFees: "User pays 0.3% fees on each swap.",
    SupplySideRevenue: "LPs receive 20% of swap fees.",
    ProtocolRevenue: "Treasury receives 80% of swap fees.",
    Revenue: "Treasury receives 80% of swap fees.",
  },
  fetch: getUniV2LogAdapter({ factory: '0x22505cb4d5d10b2c848a9d75c57ea72a66066d8c', userFeesRatio: 1, revenueRatio: 0.8, protocolRevenueRatio: 0.8 }),
  chains: [CHAIN.OPTIMISM],
}

export default adapter;