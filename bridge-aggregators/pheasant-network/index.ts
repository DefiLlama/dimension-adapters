import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchPheasantSwapVolume, pheasantSwapConfig } from "../../helpers/aggregators/pheasant-network";

// Pheasant Swap cross-chain swaps: SwapNewTrade on the source chain whose trade.toChainId is another chain, valued at the
// amount forwarded to the routing tool, trade.amount minus Pheasant's relayerFee (see helpers/aggregators/pheasant-network.ts). Same-chain swaps are aggregators/pheasant-network.
// The Pheasant Network bridge itself (NewTrade / Filled) is bridges/pheasant-network and is not part of this volume.
const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = await fetchPheasantSwapVolume(options, "cross-chain");
  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // routed through LI.FI and Squid, whose own bridge-aggregator listings also count these transfers
  fetch,
  adapter: pheasantSwapConfig,
  methodology: {
    BridgeVolume:
      "Value of tokens users hand to Pheasant Swap for a swap whose destination is another chain, measured on the source chain. Pheasant's relayer fee is excluded.",
  },
};

export default adapter;
