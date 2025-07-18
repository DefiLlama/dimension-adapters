import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const meta = {
  methodology: {
    Fees: "All swap fees paid by users.",
    UserFees: "All swap fees paid by users.",
    SupplySideRevenue: "LPs receive 100% fee of each swap.",
    Revenue: "No revenue",
    ProtocolRevenue: "No protocol revenue",
  }
};

const getUniV2LogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      meta,
      fetch: getUniV2LogAdapter({ factory: '0xfE926062Fb99CA5653080d6C14fE945Ad68c265C', ...getUniV2LogAdapterConfig }),
    },
  }
};

export default adapter;
