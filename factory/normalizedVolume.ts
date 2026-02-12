import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";
import { elastic } from "@defillama/sdk";

const HOURLY_VOLUME_INDEX = 'perp-metrics';

interface NormalizedVolumeConfig {
  protocolName: string;
  chains: string[];
  start?: number | string;
  version?: 1 | 2;
  minContracts?: number;
}

interface HourlyVolumeRecord {
  dayTimestamp: number;
  timestamp: number;
  updated_at: number;
  exchange: string;
  normalized_volume: number;
  reported_volume: number;
  contracts: number;
  active_liquidity?: number;
}


function fetchV1({ protocolName, minContracts }: { protocolName: string, minContracts?: number }){
  return async (_a: any, _b: any, options: FetchOptions) => {

    const response = await elastic.search({
      index: HOURLY_VOLUME_INDEX,
      body: {
        query: {
          bool: {
            must: [
              {
                term: {
                  dayTimestamp: options.startOfDay * 1000
                }
              },
              { term: { 'exchange.keyword': protocolName } }
            ]
          }
        },
        size: 100
      }
    });

    const records = (response.hits?.hits || []).map((hit: any) => hit._source as HourlyVolumeRecord);
    // console.log(records);
    // Verify data accuracy with min_contracts (5% miss rate threshold)
    let completeRecords = records;
    let accuracyRate = 100;
    
    if (minContracts !== undefined) {
      const expectedMinContracts = minContracts * 0.95; // 5% miss rate tolerance per record
      completeRecords = records.filter(record => (record.contracts || 0) >= expectedMinContracts);
      accuracyRate = records.length > 0 ? (completeRecords.length / records.length) * 100 : 0;
      
      if (completeRecords.length < 24) {
        throw new Error(
          `Incomplete orderbook data for ${protocolName}: ${completeRecords.length}/24 complete records (accuracy rate: ${accuracyRate.toFixed(2)}%). ` +
          `Expected at least ${expectedMinContracts.toFixed(0)} contracts per record.`
        );
      }
    } else if (records.length < 24) {
      throw new Error(`Incomplete orderbook data for ${protocolName}: ${records.length}/24 records`);
    }
    
    const dailyNormalizedVolume = completeRecords.reduce((sum, record) => {
      return sum + (record.normalized_volume || 0);
    }, 0);
    
    // Calculate average active_liquidity where >0 and not undefined
    const validActiveLiquidity = completeRecords
      .map(record => record.active_liquidity)
      .filter(val => val !== undefined && val > 0) as number[];
    
    const dailyActiveLiquidity = validActiveLiquidity.length > 0
      ? validActiveLiquidity.reduce((sum, val) => sum + val, 0) / validActiveLiquidity.length
      : 0;
    
    // const dailyVolume = completeRecords.reduce((sum, record) => {
    //   return sum + (record.reported_volume || 0);
    // }, 0);

    return {
      dailyNormalizedVolume: dailyNormalizedVolume.toString(),
      dailyActiveLiquidity: dailyActiveLiquidity.toString(),
      // dailyVolume: dailyVolume.toString()
    };
  }
}

function fetchV2({ protocolName, minContracts }: { protocolName: string, minContracts?: number }){
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
                    gte: (startTimestamp + 1) * 1000,
                    lt: endTimestamp * 1000
                  }
                }
              },
              { term: { 'exchange.keyword': protocolName } }
            ]
          }
        },
        size: 100
      }
    });

    const records = (response.hits?.hits || []).map((hit: any) => hit._source as HourlyVolumeRecord);
    // console.log(records);

    // Verify data accuracy with min_contracts (5% miss rate threshold)
    let completeRecords = records;
    let accuracyRate = 100;
    
    if (minContracts !== undefined) {
      const expectedMinContracts = minContracts * 0.95; // 5% miss rate tolerance per record
      completeRecords = records.filter(record => (record.contracts || 0) >= expectedMinContracts);
      accuracyRate = records.length > 0 ? (completeRecords.length / records.length) * 100 : 0;
      
      if (completeRecords.length < 24) {
        throw new Error(
          `Incomplete orderbook data for ${protocolName}: ${completeRecords.length}/24 complete records (accuracy rate: ${accuracyRate.toFixed(2)}%). ` +
          `Expected at least ${expectedMinContracts.toFixed(0)} contracts per record.`
        );
      }
    } else if (records.length < 24) {
      throw new Error(`Incomplete orderbook data for ${protocolName}: ${records.length}/24 records`);
    }

    const dailyNormalizedVolume = completeRecords.reduce((sum, record) => {
      return sum + (record.normalized_volume || 0);
    }, 0);
    
    // Calculate average active_liquidity where >0 and not undefined
    const validActiveLiquidity = completeRecords
      .map(record => record.active_liquidity)
      .filter(val => val !== undefined && val > 0) as number[];
    
    const dailyActiveLiquidity = validActiveLiquidity.length > 0
      ? validActiveLiquidity.reduce((sum, val) => sum + val, 0) / validActiveLiquidity.length
      : 0;
    
    // const dailyVolume = completeRecords.reduce((sum, record) => {
    //   return sum + (record.reported_volume || 0);
    // }, 0);

    return {
      dailyNormalizedVolume: dailyNormalizedVolume.toString(),
      dailyActiveLiquidity: dailyActiveLiquidity.toString(),
      // dailyVolume: dailyVolume.toString()
    };
  }
}

function dailyNormalizedVolumeAdapter(config: NormalizedVolumeConfig): SimpleAdapter {
  const { protocolName, chains, start, version = 1, minContracts } = config;

  const adapter: any = {};
  const fetchFn = version === 2 ? fetchV2({ protocolName, minContracts }) : fetchV1({ protocolName, minContracts });

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
    start: '2026-01-20',
    minContracts: 250
  }),
  'edgex': dailyNormalizedVolumeAdapter({
    protocolName: 'edgex',
    chains: [CHAIN.EDGEX],
    start: '2026-01-20',
    minContracts: 100
  }),
  'lighter': dailyNormalizedVolumeAdapter({
    protocolName: 'lighter',
    chains: [CHAIN.ZK_LIGHTER],
    start: '2026-01-20',
    minContracts: 100
  }),
  'aster': dailyNormalizedVolumeAdapter({
    protocolName: 'aster',
    chains: [CHAIN.OFF_CHAIN],
    start: '2026-01-20',
    minContracts: 150
  }),
  'paradex': dailyNormalizedVolumeAdapter({
    protocolName: 'paradex',
    chains: [CHAIN.PARADEX],
    start: '2026-01-20',
    version: 2,
    minContracts: 90
  }),
  'sunx': dailyNormalizedVolumeAdapter({
    protocolName: 'sunx',
    chains: [CHAIN.TRON],
    start: '2026-01-20'
  }),
  'apex-omni': dailyNormalizedVolumeAdapter({
    protocolName: 'apex-omni',
    chains: [CHAIN.ETHEREUM],
    start: '2026-01-20',
    minContracts: 90
  }),
  'grvt': dailyNormalizedVolumeAdapter({
    protocolName: 'grvt',
    chains: [CHAIN.GRVT],
    start: '2026-01-20',
    version: 2,
    minContracts: 80
  }),
  'pacifica': dailyNormalizedVolumeAdapter({
    protocolName: 'pacifica',
    chains: [CHAIN.SOLANA],
    start: '2026-01-20',
    version: 2,
    minContracts: 45
  }),
  'extended': dailyNormalizedVolumeAdapter({
    protocolName: 'extended',
    chains: [CHAIN.STARKNET],
    start: '2026-01-20',
    minContracts: 75
  }),
} as const;

export const { protocolList, getAdapter } = createFactoryExports(protocols);
