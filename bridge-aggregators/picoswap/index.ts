import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAINS, fetchDay, rowsFor, START } from "../../aggregators/picoswap/api";

// PicoSwap's cross-chain swaps, all routed through Relay, counted on the chain paid from. Same-chain swaps are in
// aggregators/picoswap. Source and methodology: aggregators/picoswap/api.ts.
const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  for (const row of rowsFor(options)) dailyBridgeVolume.addUSDValue(row.relay.crossChain.volumeUsd);
  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: fetchDay as any,
  chains: CHAINS,
  start: START,
  methodology: {
    BridgeVolume: "USD value sent in PicoSwap swaps that arrive on another chain, all routed through Relay (from PicoSwap's daily rollup of its Relay request ledger), counted on the chain paid from.",
  },
};

export default adapter;
