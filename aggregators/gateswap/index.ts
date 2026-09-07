import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { gateSwapChainConfig, getGateSwapChainData, prefetchGateSwapDimensions } from "../../helpers/gateswap";

async function fetch(options: FetchOptions) {
  return { dailyVolume: getGateSwapChainData(options).volumeUsd };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  prefetch: prefetchGateSwapDimensions,
  methodology: {
    Volume: "USD value of successfully executed trades routed through Gate Swap, reported by the Gate Swap API for each hourly UTC window.",
  },
  adapter: Object.fromEntries(
    Object.entries(gateSwapChainConfig).map(([chain, { start }]) => [chain, { fetch, start }]),
  ),
};

export default adapter;
