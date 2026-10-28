import { SimpleAdapter } from "../../adapters/types";
import { TRISTERO_CHAINS, TRISTERO_START, fetchTristeroVolumeBuckets } from "../../helpers/tristero";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: async (options) => ({ dailyVolume: (await fetchTristeroVolumeBuckets(options)).darkpool }),
  chains: TRISTERO_CHAINS,
  start: TRISTERO_START,
  methodology: {
    Volume: "Darkpool volume: source-side token amounts of TAKER orders matched inside Tristero against a filler with no external venue calls, plus MARGIN opens and the loan settlement leg of margin closes. Counted once, on the source leg the taker sells - the filler's side of the fill is the same trade settling, not a second trade. Orders where the taker is also the filler are excluded, being circular rather than traded with a third party. Orders routed through external venues are aggregation flow and are reported on the Tristero Aggregator adapter instead.",
  },
};

export default adapter;
