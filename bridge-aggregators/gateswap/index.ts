import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { gateSwapChainConfig, getGateSwapBridgeData, prefetchGateSwapBridgeDimensions } from "../../helpers/gateswap";

async function fetch(options: FetchOptions) {
  return { dailyBridgeVolume: getGateSwapBridgeData(options).volumeUsd };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  prefetch: prefetchGateSwapBridgeDimensions,
  methodology: {
    Volume: "USD value of successfully executed cross-chain transfers routed through Gate Swap's bridge aggregator, reported by the Gate Swap API for each hourly UTC window.",
  },
  adapter: Object.fromEntries(
    Object.entries(gateSwapChainConfig).map(([chain, { start }]) => [chain, { fetch, start }]),
  ),
};

export default adapter;
