import { SimpleAdapter } from "../../adapters/types";
import { TRISTERO_DEX_CHAINS, fetchTristeroVolumeBuckets } from "../../helpers/tristero";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: async (options) => ({ dailyVolume: (await fetchTristeroVolumeBuckets(options)).darkpool }),
  adapter: TRISTERO_DEX_CHAINS,
  methodology: {
    Volume: "Darkpool volume: TAKER orders matched inside Tristero against a filler with no external venue calls, plus MARGIN opens and the loan settlement leg of margin closes. A darkpool fill has a real counterparty on each side - the taker sells the source asset and a filler posts the destination asset against it - so both legs are counted, and a $100 fill books $200. Orders where the taker is also the filler are excluded, being circular rather than traded with a third party. Orders routed through external venues are aggregation flow and are reported on the Tristero Aggregator adapter instead.",
  },
};

export default adapter;
