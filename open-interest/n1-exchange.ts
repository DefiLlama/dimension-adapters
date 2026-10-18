import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetch } from "../dexs/n1-exchange";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: async (options) => ({ openInterestAtEnd: (await fetch(options)).openInterestAtEnd }),
  chains: [CHAIN.N1],
  start: "2025-12-08",
  runAtCurrTime: true,
  // The N1 API serves only the current open interest, so an hourly pull would re-read
  // the same snapshot and the slot aggregation would sum a point-in-time value.
  pullHourly: false,
  methodology: {
    OpenInterest:
      "Current notional open interest across all N1 Exchange USD perpetual markets, calculated as base open interest multiplied by index price.",
  },
};

export default adapter;
