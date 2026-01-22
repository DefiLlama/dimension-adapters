import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";
import { elastic } from "@defillama/sdk";

const HOURLY_VOLUME_INDEX = 'hourly-normalized-volume';

interface NormalizedVolumeConfig {
  protocolName: string;
  chains: string[];
  start?: number | string;
}

interface HourlyVolumeRecord {
  dayTimestamp: number;
  timestamp: number;
  updated_at: number;
  exchange: string;
  normalized_volume: number;
  reported_volume: number;
  contracts: number;
}

/**
 * Create a fetcher that queries hourly records and aggregates daily normalized volume for a protocol from Elasticsearch.
 *
 * @param protocolName - Protocol or exchange identifier used to filter hourly records
 * @returns A function that accepts `FetchOptions` (containing `startTimestamp` and `endTimestamp`), queries hourly records for the protocol, and returns an object with `dailyNormalizedVolume` as a string
 * @throws Error if fewer than 24 hourly records are found for the requested range (message: "Incomplete orderbook data for <protocolName>")
 */
function fetch({ protocolName }: { protocolName: string }){
  return async (options: FetchOptions) => {
    const { startTimestamp, endTimestamp } = options;
    
    const response = await elastic.search({
      index: HOURLY_VOLUME_INDEX,
      body: {
        query: {
          bool: {
            must: [
              { 
                range: { 
                  timestamp: {
                    gte: startTimestamp * 1000,
                    lt: endTimestamp * 1000
                  }
                }
              },
              { term: { exchange: protocolName } }
            ]
          }
        },
        size: 10000
      }
    });

    const records = (response.hits?.hits || []).map((hit: any) => hit._source as HourlyVolumeRecord);
    // console.log(records.length)
    if (records.length < 24) throw new Error('Incomplete orderbook data for ' + protocolName)
    const dailyNormalizedVolume = records.reduce((sum, record) => {
      return sum + (record.normalized_volume || 0);
    }, 0);
    
    // const dailyVolume = records.reduce((sum, record) => {
    //   return sum + (record.reported_volume || 0);
    // }, 0);

    return {
      dailyNormalizedVolume: dailyNormalizedVolume.toString(),
      // dailyVolume: dailyVolume.toString()
    };
  }
}

/**
 * Create a SimpleAdapter that exposes a per-chain fetch handler and start timestamp for daily normalized volume.
 *
 * @param config - Configuration for the adapter
 * @param config.protocolName - Protocol identifier used to filter volume records
 * @param config.chains - Array of chain keys to expose in the adapter
 * @param config.start - Earliest supported timestamp or date string for the adapter
 * @returns A SimpleAdapter object with `version: 2` and an `adapter` mapping each chain to `{ fetch, start }`
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
    adapter
  };
}

const protocols = {
  'hyperliquid': dailyNormalizedVolumeAdapter({
    protocolName: 'hyperliquid',
    chains: [CHAIN.HYPERLIQUID],
    start: '2026-01-20'
  }),
  'edgex': dailyNormalizedVolumeAdapter({
    protocolName: 'edgex',
    chains: [CHAIN.EDGEX],
    start: '2026-01-20'
  }),
  'lighter': dailyNormalizedVolumeAdapter({
    protocolName: 'lighter',
    chains: [CHAIN.ZK_LIGHTER],
    start: '2026-01-20'
  }),
  'aster': dailyNormalizedVolumeAdapter({
    protocolName: 'aster',
    chains: [CHAIN.OFF_CHAIN],
    start: '2026-01-20'
  }),
  'paradex': dailyNormalizedVolumeAdapter({
    protocolName: 'paradex',
    chains: [CHAIN.PARADEX],
    start: '2026-01-20'
  }),
  'sunx': dailyNormalizedVolumeAdapter({
    protocolName: 'sunx',
    chains: [CHAIN.TRON],
    start: '2026-01-20'
  }),
  'apex-omni': dailyNormalizedVolumeAdapter({
    protocolName: 'apex-omni',
    chains: [CHAIN.ETHEREUM],
    start: '2026-01-20'
  }),
  'grvt': dailyNormalizedVolumeAdapter({
    protocolName: 'grvt',
    chains: [CHAIN.GRVT],
    start: '2026-01-20'
  }),
  'pacifica': dailyNormalizedVolumeAdapter({
    protocolName: 'pacifica',
    chains: [CHAIN.SOLANA],
    start: '2026-01-20'
  }),
  'extended': dailyNormalizedVolumeAdapter({
    protocolName: 'extended',
    chains: [CHAIN.STARKNET],
    start: '2026-01-20'
  }),
} as const;

export const { protocolList, getAdapter } = createFactoryExports(protocols);