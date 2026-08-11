import { SimpleAdapter } from "../../adapters/types";
import { TRISTERO_AGGREGATOR_CHAINS, fetchTristeroVolumeBuckets } from "../../helpers/tristero";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: async (options) => ({ dailyVolume: (await fetchTristeroVolumeBuckets(options)).aggregation }),
  adapter: TRISTERO_AGGREGATOR_CHAINS,
  methodology: {
    Volume: "Source-side token amounts of Tristero orders routed through external venues: TAKER orders submitted with arb calls, RELAY and CROSS orders bridged over CCTP, and EXTERNAL orders. Counted once, on the source leg - the destination leg of a cross-chain order is not counted again. Orders filled internally against a Tristero filler are darkpool flow and are reported on the Tristero Spot adapter instead.",
  },
};

export default adapter;
