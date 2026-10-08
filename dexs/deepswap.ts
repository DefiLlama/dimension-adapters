import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchDeepSwap } from "../helpers/deep-liquidity";

// DeepSwap: DEEP's constant-product AMM (program HCrCy6bzHhZ1b6bXwQAucEFkKXyzYMh3hgAR8UPrYSEP),
// a fork of Raydium cp-swap. Volume is read from the program's swap events.
const fetch = async (options: FetchOptions) => {
  const { dailyVolume } = await fetchDeepSwap(options);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-08",
  methodology: {
    Volume: "The quote-token side (SOL on a TOKEN/SOL pool) of every swap, before fees.",
  },
};

export default adapter;
