import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAINS, fetchDay, rowsFor, START } from "./api";

// PicoSwap's same-chain swaps: through Relay, and its direct 0x / Jupiter "better price" route. Cross-chain swaps are in
// bridge-aggregators/picoswap, fees in fees/picoswap. Source and methodology: ./api.ts.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const row of rowsFor(options)) dailyVolume.addUSDValue(row.relay.sameChain.volumeUsd + row.direct.volumeUsd);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: fetchDay as any,
  chains: CHAINS,
  start: START,
  methodology: {
    Volume: "USD value sent in PicoSwap swaps that stay on one chain: swaps routed through Relay (from PicoSwap's daily rollup of its Relay request ledger) and PicoSwap's direct 0x / Jupiter swaps, counted on the chain paid from.",
  },
};

export default adapter;
