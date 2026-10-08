import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchDeepLaunchpad } from "../helpers/deep-liquidity";

// DEEP launchpad: bonding-curve trades of the Deep Curve program
// (7czURwVLkQpcF1HVhhZU5GGzvPA8YniogZY1BhZHCDtA), read from its TradeEvent logs.
// Trades of graduated tokens happen on DeepSwap and are in the `deepswap` adapter.
const fetch = async (options: FetchOptions) => {
  const { dailyVolume } = await fetchDeepLaunchpad(options);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-08",
  methodology: {
    Volume: "SOL paid by buyers and SOL paid out to sellers on the bonding curves, before fees.",
  },
};

export default adapter;
