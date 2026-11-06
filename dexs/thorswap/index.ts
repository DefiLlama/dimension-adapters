import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addVolume, getChainStats, adapterChains } from "../../helpers/aggregators/swapStatsApi";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chain = await getChainStats(options);
  if (chain) {
    addVolume(dailyVolume, chain.aggregatorVolumeUsd, chain.aggregatorVolumeTokens);
    addVolume(dailyVolume, chain.bridgeAggregatorVolumeUsd, chain.bridgeAggregatorVolumeTokens);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // swaps settle on liquidity venues DefiLlama already tracks (THORChain, Maya, Chainflip, NEAR Intents)
  doublecounted: true,
  fetch,
  adapter: adapterChains(),
  methodology: {
    Volume: "All swaps routed through the protocol, same-chain and cross-chain, counted in the hour they were created on the chain they sold from. Volume before 24 April 2022 is the weekly totals spread evenly across hours; per-swap data is not available for that period.",
  },
};

export default adapter;
