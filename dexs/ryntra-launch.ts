import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { DAMM_V2_PROGRAM, LAUNCH_START, USDC, launchCurveSwaps, launchReferralSwaps } from "../helpers/ryntra";

// Volume of tokens launched with Ryntra Launch (https://ryntra.io), a launchpad on Meteora's Dynamic Bonding Curve:
// every swap on their bonding curves, and after graduation the trades made through Ryntra in their DAMM v2 pools —
// the same swaps fees/ryntra-launch.ts counts the fees of. Meteora already lists them, so the volume is double
// counted.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  // The quote side of each swap, in USDC: what a buyer paid in, what a seller received.
  for (const swap of await launchCurveSwaps(options.startTimestamp, options.endTimestamp)) dailyVolume.add(USDC, swap.quoteVolume);
  for (const swap of await launchReferralSwaps(options.startTimestamp, options.endTimestamp)) if (swap.program === DAMM_V2_PROGRAM) dailyVolume.add(USDC, swap.quoteVolume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  // A handful of pools, read straight from the chain each hour.
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: new Date(LAUNCH_START * 1000).toISOString().slice(0, 10),
  doublecounted: true,
  methodology: {
    Volume: "The USDC side of every swap on the bonding curves of tokens launched with Ryntra Launch (Meteora DBC pools on its configs, created by its pool payer), from the swap events, and after a token graduates, of the trades made through Ryntra in its Meteora DAMM v2 pool. Double counted: Meteora already lists this volume.",
  },
};

export default adapter;
