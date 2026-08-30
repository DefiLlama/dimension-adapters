import { SimpleAdapter } from "../../adapters/types";
import { TRISTERO_CHAINS, TRISTERO_START, fetchTristeroVolumeBuckets } from "../../helpers/tristero";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: async (options) => ({ dailyVolume: (await fetchTristeroVolumeBuckets(options)).aggregation }),
  chains: TRISTERO_CHAINS,
  start: TRISTERO_START,
  methodology: {
    Volume: "Source-side token amounts of Tristero orders routed through external venues: TAKER orders submitted with arb calls, RELAY and CROSS orders bridged over CCTP, and EXTERNAL orders. Counted once, on the source leg - the counterparty is an external venue rather than a Tristero maker, so counting the output as well would book the same trade twice, and the destination leg of a cross-chain order is not counted again on the receiving chain. Orders matched internally against a filler are darkpool flow and are reported on the Tristero Darkpool adapter instead.",
  },
};

export default adapter;
