import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addVolume, getChainStats, adapterChains } from "../../helpers/aggregators/thorswap";

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const chain = await getChainStats(options);
  if (chain) addVolume(dailyBridgeVolume, chain.bridgeAggregatorVolumeUsd, chain.bridgeAggregatorVolumeTokens);
  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  // the swap stats API marks an hour final only 2h+ after it ends, so hourly runs fail every hour
  version: 1,
  fetch,
  adapter: adapterChains(),
  methodology: {
    BridgeVolume: "Cross-chain swaps routed through the protocol, counted in the hour they were created on the chain they sold from. Volume before 24 April 2022 is the weekly totals spread evenly across hours; per-swap data is not available for that period.",
  },
};

export default adapter;
