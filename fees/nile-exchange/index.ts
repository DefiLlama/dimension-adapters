import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

// https://docs.ramses.exchange/ramses-cl-v2/concentrated-liquidity/fee-distribution
const methodology = {
  Fees: "Swap fees charged on each trade.",
  UserFees: "100% of swap fees paid by users.",
  Revenue: "100% of collected fees.",
  ProtocolRevenue: "8% of collected fees go to the protocol treasury.",
  HoldersRevenue: "92% of collected fees distributed to xNILE stakers.",
  SupplySideRevenue: "0% of collected fees go to LPs.",
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: getUniV3LogAdapter({
        factory: "0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42",
        revenueRatio: 1,
        userFeesRatio: 1,
        protocolRevenueRatio: 0.08,
        holdersRevenueRatio: 0.92,
      }),
      start: 1705968000,
    },
  },
  methodology,
};

export default adapter;
