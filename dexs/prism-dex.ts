import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: "Swap volume from all Prism DEX V3 pools deployed via the Prism DEX V3 factory.",
    Fees: "Users pay each pool's configured V3 fee tier on every swap.",
    UserFees: "Equals total swap fees paid by users.",
    Revenue: "When protocol fees are enabled on a pool, 25% of swap fees are counted as protocol revenue.",
    ProtocolRevenue: "When protocol fees are enabled on a pool, 25% of swap fees are counted as protocol revenue.",
    SupplySideRevenue: "When protocol fees are enabled on a pool, 75% of swap fees are distributed to LPs.",
  },
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch: getUniV3LogAdapter({
        factory: "0x1adb8f973373505bb206e0e5d87af8fb1f5514ef",
        userFeesRatio: 1,
        revenueRatio: 0.25,
        protocolRevenueRatio: 0.25,
      }),
      // Prism DEX V3 factory deploy time: 2026-02-09 14:14:36.
      start: 1770646476,
    },
  },
};

export default adapter;
