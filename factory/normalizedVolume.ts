import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

interface NormalizedVolumeConfig {
  protocolName: string;
  chains: string[];
  start?: number | string;
}

/**
 * Creates a fetch function configured for a protocol's daily normalized volume.
 *
 * @param protocolName - The protocol identifier used to configure the returned fetch function
 * @returns A fetch function that returns an object with `dailyNormalizedVolume` as a string
 */
function fetch({ protocolName }: { protocolName: string }){
  return async (options: FetchOptions) => {
    console.log(protocolName)
    return {
      dailyNormalizedVolume: "0"
    };
  }
}

/**
 * Creates a SimpleAdapter that provides daily normalized volume fetchers for the specified protocol and chains.
 *
 * @param config - Configuration object with:
 *   - protocolName: the protocol identifier used by each chain fetcher
 *   - chains: list of chain keys to expose on the adapter
 *   - start: optional start timestamp or date string for each chain
 * @returns A SimpleAdapter exposing per-chain fetch functions and start values; the adapter is version 2 with runAtCurrTime enabled.
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
  'abc': dailyNormalizedVolumeAdapter({
    protocolName: 'abc',
    chains: [CHAIN.ETHEREUM],
    start: '2021-05-05'
  }),
} as const;

export const { protocolList, getAdapter } = createFactoryExports(protocols);