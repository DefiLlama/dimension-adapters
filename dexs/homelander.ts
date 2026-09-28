import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { collectSwaps } from "../fees/homelander/shared";

// Volume traded in the pools the Homelander plugin runs in, where the plugin
// sets the fee on every swap and closes the price gap a swap opens inside the
// same transaction.
//
// These are third-party AMM pools, so this volume is also reported by those
// AMMs' own listings; `doublecounted` is set for that reason. The plugin's own
// arbitrage legs are left out: they are not trade the pool won, and counting
// them would report the protocol's own round trips as somebody's volume.

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const { volume } = await collectSwaps(options);
  for (const [token, amount] of Object.entries(volume)) dailyVolume.add(token, amount);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  doublecounted: true,
  methodology: {
    Volume: "Swap volume of the pools the Homelander plugin runs in, measured on the pool's first token, excluding the plugin's own arbitrage legs. Pools are discovered from each plugin factory's own PluginCreated announcement, so a pool opened later is counted without a code change.",
  },
  adapter: {
    [CHAIN.BASE]: { fetch, start: "2026-03-26" },
    [CHAIN.FLARE]: { fetch, start: "2026-03-26" },
    [CHAIN.SONEIUM]: { fetch, start: "2026-05-25" },
    [CHAIN.SOMNIA]: { fetch, start: "2026-05-25" },
    [CHAIN.POLYGON]: { fetch, start: "2026-06-10" },
  },
};

export default adapter;
