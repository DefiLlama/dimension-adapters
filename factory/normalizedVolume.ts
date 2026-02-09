import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";
import { elastic } from "@defillama/sdk";

const HOURLY_VOLUME_INDEX = 'hourly-perp-metrics';

interface NormalizedVolumeConfig {
  protocolName: string;
  chains: string[];
  start?: number | string;
  version?: 1 | 2;
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

const fetch = async (options: FetchOptions) => {
}

function fetchV1({ protocolName }: { protocolName: string }){
  return async (_a: any, _b: any, options: FetchOptions) => {
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

function fetchV2({ protocolName }: { protocolName: string }){
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

function dailyNormalizedVolumeAdapter(config: NormalizedVolumeConfig): SimpleAdapter {
  const { protocolName, chains, start, version = 1 } = config;

  const adapter: any = {};
  const fetchFn = version === 2 ? fetchV2({ protocolName }) : fetchV1({ protocolName });

  chains.forEach(chain => {
    adapter[chain] = {
      fetch: fetchFn,
      start
    };
  });

  return {
    version,
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
    start: '2026-01-20',
    version: 2
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
    start: '2026-01-20',
    version: 2
  }),
  'pacifica': dailyNormalizedVolumeAdapter({
    protocolName: 'pacifica',
    chains: [CHAIN.SOLANA],
    start: '2026-01-20',
    version: 2
  }),
  'extended': dailyNormalizedVolumeAdapter({
    protocolName: 'extended',
    chains: [CHAIN.STARKNET],
    start: '2026-01-20'
  }),
} as const;

export const { protocolList, getAdapter } = createFactoryExports(protocols);
