import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addVolume, getChainStats, adapterChains } from "../../helpers/aggregators/thorswap";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chain = await getChainStats(options);
  if (chain) addVolume(dailyVolume, chain.aggregatorVolumeUsd, chain.aggregatorVolumeTokens);
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
    Volume: "Same-chain swaps routed through the protocol, counted in the hour they were created on the chain they sold from.",
  },
};

export default adapter;
