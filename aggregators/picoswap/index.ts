import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAINS, fetchDay, orderRowsFor, rowsFor, START } from "./api";

// PicoSwap's same-chain swaps: through Relay, its direct 0x / Jupiter "better price" route, and filled limit orders and
// DCA (CoW Protocol on EVM, Jupiter on Solana; from 2026-11-24). Cross-chain swaps are in bridge-aggregators/picoswap,
// fees in fees/picoswap. Source and methodology: ./api.ts.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const row of rowsFor(options)) dailyVolume.addUSDValue(row.relay.sameChain.volumeUsd + row.direct.volumeUsd);
  for (const row of orderRowsFor(options)) dailyVolume.addUSDValue(row.limit.volumeUsd + row.dca.volumeUsd);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: fetchDay as any,
  chains: CHAINS,
  start: START,
  methodology: {
    Volume: "USD value sent in PicoSwap swaps that stay on one chain: swaps routed through Relay (from PicoSwap's daily rollup of its Relay request ledger) and PicoSwap's direct 0x / Jupiter swaps, counted on the chain paid from; plus, from 2026-11-24, filled limit orders and DCA placed through PicoSwap (CoW Protocol on EVM chains, Jupiter Trigger and Recurring on Solana), read from CoW's and Jupiter's own APIs and priced with DefiLlama's token prices at the fill time.",
  },
};

export default adapter;
