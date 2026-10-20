import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchDay } from "../fees/seeryx";

// Seeryx trading volume: see fees/seeryx.ts for the source (the exchange's public daily statistics).

const fetch = async (options: FetchOptions) => {
  const d = await fetchDay(options);
  return { dailyVolume: d.volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-04",
  methodology: {
    Volume: "Shares x price of every fill in USDC (the collateral that changed hands), across the crypto and stock rounds and the event markets; the exchange's own synthetic probes are left out.",
  },
};

export default adapter;
