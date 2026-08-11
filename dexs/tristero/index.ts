import { SimpleAdapter } from "../../adapters/types";
import { TRISTERO_DEX_CHAINS, fetchTristeroVolumeBuckets } from "../../helpers/tristero";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: async (options) => ({ dailyVolume: (await fetchTristeroVolumeBuckets(options)).darkpool }),
  adapter: TRISTERO_DEX_CHAINS,
  methodology: {
    Volume: "Darkpool volume: source-side token amounts of TAKER orders filled against a Tristero filler with no external venue calls, plus MARGIN opens (collateral and loan) and the loan settlement leg of margin closes. TAKER orders that route through an external venue are reported separately on the Tristero Aggregator adapter. Pre-v3 OrderFilled volume is included here in full: that event does not record whether an order used external venues, so its history is not split.",
  },
};

export default adapter;
