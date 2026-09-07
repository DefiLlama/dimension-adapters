import { FetchOptions, SimpleAdapter } from "../adapters/types";
import feesAdapter, { fetchVolume } from "../fees/basestonk";

// Swap volume in BaseStonk's launched pools. The fee adapter already reads
// every Swap in a taxed pool to price its fees; this lists the same volume
// on the DEX dashboard.
const fetch = async (options: FetchOptions) => {
  const { dailyVolume } = await fetchVolume(options);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: feesAdapter.adapter,
  methodology: {
    Volume: "The pair side of every swap in a taxed BaseStonk pool, including the creator's dev buy at launch and excluding the hook's own buyback and liquidity swaps. Counted under Uniswap v4 as well.",
  },
  pullHourly: true,
  doublecounted: true, // uni-v4
};

export default adapter;
