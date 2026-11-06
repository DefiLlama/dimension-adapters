import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchPheasantSwapVolume, pheasantSwapChainConfig } from "../helpers/aggregators/pheasant-network";

// Pheasant Swap same-chain swaps: SwapNewTrade whose trade.toChainId is the chain's own id, valued at the amount forwarded
// to the routing tool, trade.amount minus Pheasant's relayerFee (see helpers/aggregators/pheasant-network.ts). Cross-chain swaps are bridge-aggregators/pheasant-network.
const chainConfig = pheasantSwapChainConfig();

const fetch = async (options: FetchOptions) => {
  const dailyVolume = await fetchPheasantSwapVolume(options, "same-chain");
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // executed by LI.FI and Squid, whose own aggregator listings also count these swaps
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Value of tokens users hand to Pheasant Swap for a swap on the same chain. Pheasant's relayer fee is excluded.",
  },
};

export default adapter;
