import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

interface NormalizedVolumeConfig {
  protocolName: string;
  chains: string[];
  start?: number | string;
}

function fetch({ protocolName }: { protocolName: string }){
  return async (options: FetchOptions) => {
    // console.log(protocolName)
    return {
      dailyNormalizedVolume: "0"
    };
  }
}

/**
 * Adapter factory for dailyNormalizedVolume metric
 */
function dailyNormalizedVolumeAdapter(config: NormalizedVolumeConfig): SimpleAdapter {
  const { protocolName, chains, start } = config;

  const adapter: any = {};

  chains.forEach(chain => {
    adapter[chain] = {
      fetch: fetch({ protocolName }),
      start
    };
  });

  return {
    version: 2,
    runAtCurrTime: true,
    adapter
  };
}

// Define all protocols
const protocols = {
  'hyperliquid': dailyNormalizedVolumeAdapter({
    protocolName: 'hyperliquid',
    chains: [CHAIN.HYPERLIQUID],
    start: '2026-01-18'
  }),
} as const;

export const { protocolList, getAdapter } = createFactoryExports(protocols);
