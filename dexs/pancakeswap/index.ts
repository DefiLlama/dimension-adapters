import { BaseAdapter, BreakdownAdapter, Dependencies, FetchOptions, FetchResult, FetchV2, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph"
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";
import * as sdk from "@defillama/sdk";
import { httpGet } from "../../utils/fetchURL";
import { ethers } from "ethers";
import { cache } from "@defillama/sdk";
import { queryDuneSql } from "../../helpers/dune";
import { getEnv } from "../../helpers/env";
import { getBscV2Data } from "./bscv2";

enum DataSource {
  GRAPH = 'graph',
  LOGS = 'logs',
  PANCAKE_EXPLORER = 'pancake_explorer',
  CUSTOM = 'custom',
  DUNE = 'dune'
}

interface BaseChainConfig {
  start: number | string;
  dataSource: DataSource;
}

interface GraphChainConfig extends BaseChainConfig {
  dataSource: DataSource.GRAPH;
  endpoint?: string;
  requestHeaders?: any;
}

interface LogsChainConfig extends BaseChainConfig {
  dataSource: DataSource.LOGS;
  endpoint?: string;
  factory: string;
}

interface ExplorerChainConfig extends BaseChainConfig {
  dataSource: DataSource.PANCAKE_EXPLORER;

  // bsc, ethereum, base, opbnb, zksync, polygon-zkevm,linea, arbitrum
  explorerChainSlug: string;
}

interface CustomChainConfig extends BaseChainConfig {
  dataSource: DataSource.CUSTOM;
  totalVolume?: number;
}

interface DuneChainConfig extends BaseChainConfig {
  dataSource: DataSource.DUNE;
}

type ChainConfig = GraphChainConfig | LogsChainConfig | CustomChainConfig | ExplorerChainConfig | DuneChainConfig;
export const PROTOCOL_CONFIG: Record<string, Record<string, ChainConfig>> = {
  v1: {
    [CHAIN.BSC]: {
      start: '2023-04-01',
      dataSource: DataSource.CUSTOM,
      totalVolume: 103394400000
    }
  },
  v2: {
    [CHAIN.BSC]: {
      start: '2021-04-23',
      dataSource: DataSource.CUSTOM,
      // endpoint: "https://proxy-worker.pancake-swap.workers.dev/bsc-exchange",
      // requestHeaders: {
      //   "origin": "https://pancakeswap.finance",
      // }
    },
    [CHAIN.ETHEREUM]: {
      start: '2022-09-27',
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('9opY17WnEPD4REcC43yHycQthSeUMQE26wyoeMjZTLEx')
      factory: '0x1097053fd2ea711dad45caccc45eff7548fcb362',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      start: '2023-06-28',
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('37WmH5kBu6QQytRpMwLJMGPRbXvHgpuZsWqswW4Finc2'),
      factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E'
    },
    [CHAIN.ERA]: {
      start: '2023-07-24',
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('6dU6WwEz22YacyzbTbSa3CECCmaD8G7oQ8aw6MYd5VKU')
      factory: '0xd03D8D566183F0086d8D09A84E1e30b58Dd5619d'
    },
    [CHAIN.ARBITRUM]: {
      start: '2023-08-08',
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('EsL7geTRcA3LaLLM9EcMFzYbUgnvf8RixoEEGErrodB3')
      factory: '0x02a84c1b3bbd7401a5f7fa98a384ebc70bb5749e',
    },
    [CHAIN.LINEA]: {
      start: '2023-08-24',
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('Eti2Z5zVEdARnuUzjCbv4qcimTLysAizsqH3s6cBfPjB'),
      factory: '0x02a84c1b3bbd7401a5f7fa98a384ebc70bb5749e',
    },
    [CHAIN.BASE]: {
      start: '2023-08-31',
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('2NjL7L4CmQaGJSacM43ofmH6ARf6gJoBeBaJtz9eWAQ9'),
      factory: '0x02a84c1b3bbd7401a5f7fa98a384ebc70bb5749e',
    },
    [CHAIN.OP_BNB]: {
      start: '2023-09-19',
      dataSource: DataSource.LOGS,
      // endpoint: `${getEnv('PANCAKESWAP_OPBNB_SUBGRAPH')}/subgraphs/name/pancakeswap/exchange-v2`,
      factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E'
    },
    [CHAIN.APTOS]: {
      start: '2023-11-09',
      dataSource: DataSource.CUSTOM
    },
    [CHAIN.MONAD]: {
      start: '2025-11-23',
      dataSource: DataSource.LOGS,
      factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E'
    },
  },
  v3: {
    [CHAIN.BSC]: {
      start: '2023-04-01',
      // dataSource: DataSource.PANCAKE_EXPLORER,
      // endpoint: sdk.graph.modifyEndpoint('A1fvJWQLBeUAggX2WQTMm3FKjXTekNXo77ZySun4YN2m')
      // explorerChainSlug: 'bsc',
      // factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
      dataSource: DataSource.DUNE,
    },
    [CHAIN.ETHEREUM]: {
      start: '2023-04-01',
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('CJYGNhb7RvnhfBDjqpRnD3oxgyhibzc7fkAMa38YV3oS')
    },
    [CHAIN.POLYGON_ZKEVM]: {
      start: '2023-06-08',
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('7HroSeAFxfJtYqpbgcfAnNSgkzzcZXZi6c75qLPheKzQ'),
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'
    },
    [CHAIN.ERA]: {
      start: '2023-07-24',
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('3dKr3tYxTuwiRLkU9vPj3MvZeUmeuGgWURbFC72ZBpYY')
      factory: '0x1bb72e0cbbea93c08f535fc7856e0338d7f7a8ab',
    },
    [CHAIN.ARBITRUM]: {
      start: '2023-08-08',
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('251MHFNN1rwjErXD2efWMpNS73SANZN8Ua192zw6iXve')
    },
    [CHAIN.LINEA]: {
      start: '2023-08-24',
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('6gCTVX98K3A9Hf9zjvgEKwjz7rtD4C1V173RYEdbeMFX')
      // factory: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
    },
    [CHAIN.BASE]: {
      start: '2023-08-21',
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('5YYKGBcRkJs6tmDfB3RpHdbK2R5KBACHQebXVgbUcYQp')
    },
    [CHAIN.OP_BNB]: {
      start: '2023-08-31',
      dataSource: DataSource.LOGS,
      // endpoint: `${getEnv('PANCAKESWAP_OPBNB_SUBGRAPH')}/subgraphs/name/pancakeswap/exchange-v3`,
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'
    }
  },
  stableswap: {
    [CHAIN.ETHEREUM]: {
      start: '2024-01-16',
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('CoKbk4ey7JFGodyx1psQ21ojW4UhSoWBVcCTxTwEuJUj')
    },
    [CHAIN.BSC]: {
      start: '2022-09-21',
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('C5EuiZwWkCge7edveeMcvDmdr7jjc1zG4vgn8uucLdfz')
    },
    [CHAIN.ARBITRUM]: {
      start: '2024-01-16',
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('y7G5NUSq5ngsLH2jBGQajjxuLgW1bcqWiBqKmBk3MWM')
    }
  }
};

export const FEE_CONFIG = {
  V2_V3: {
    type: "volume" as const,
    Fees: 0.25,
    ProtocolRevenue: 0.0225,
    HoldersRevenue: 0.0575,
    UserFees: 0.25,
    SupplySideRevenue: 0.17,
    Revenue: 0.08
  },
  STABLESWAP: {
    type: "volume" as const,
    Fees: 0.25,
    ProtocolRevenue: 0.025,
    HoldersRevenue: 0.1,
    UserFees: 0.25,
    SupplySideRevenue: 0.125,
    Revenue: 0.125, // ProtocolRevenue + HoldersRevenue
  }
}

const ABIS = {
  V2: {
    POOL_CREATE: 'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
    SWAP_EVENT: 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
  },
  V3: {
    POOL_CREATE: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
    SWAP_EVENT: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'
  }
}



const createEndpointMap = (version: keyof typeof PROTOCOL_CONFIG) => {
  const result: IJSON<string> = {};
  
  Object.entries(PROTOCOL_CONFIG[version]).forEach(([chain, config]) => {
    if (config.dataSource === DataSource.GRAPH && (config as GraphChainConfig).endpoint) {
      result[chain] = (config as GraphChainConfig).endpoint!;
    }
  });
  
  return result;
};

const createHeadersMap = (version: keyof typeof PROTOCOL_CONFIG) => {
  const result: IJSON<any> = {};
  
  Object.entries(PROTOCOL_CONFIG[version]).forEach(([chain, config]) => {
    if (config.dataSource === DataSource.GRAPH && (config as GraphChainConfig).requestHeaders) {
      result[chain] = (config as GraphChainConfig).requestHeaders;
    }
  });
  
  return result;
};

const v2Endpoints = createEndpointMap('v2');
const v2Headers = createHeadersMap('v2');
const v3Endpoints = createEndpointMap('v3');
const stableswapEndpoints = createEndpointMap('stableswap');

const graphs = getGraphDimensions2({
  graphUrls: v2Endpoints,
  graphRequestHeaders: v2Headers,
  totalVolume: {
    factory: "pancakeFactories"
  },
  feesPercent: FEE_CONFIG.V2_V3
});

const graphsStableSwap = getGraphDimensions2({
  graphUrls: stableswapEndpoints,
  totalVolume: {
    factory: "factories"
  },
  feesPercent: FEE_CONFIG.STABLESWAP
});

const v3Graph = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
  },
  totalFees: {
    factory: "factories",
  },
});

interface ISwapEventData {
  type: string;
  amount_x_in: string;
  amount_x_out: string;
  amount_y_in: string;
  amount_y_out: string;
  user: string;
}

const account = '0xc7efb4076dbe143cbcd98cfaaa929ecfc8f299203dfff63b95ccb6bfe19850fa';
const getToken = (i: string) => i.split('<')[1].replace('>', '').split(', ');
const APTOS_RPC = getEnv('APTOS_RPC');

const getResources = async (account: string): Promise<any[]> => {
  const data: any = []
  let lastData: any;
  let cursor
  do {
    let url = `${APTOS_RPC}/v1/accounts/${account}/resources?limit=9999`
    if (cursor) url += '&start=' + cursor
    const res = await httpGet(url, undefined, { withMetadata: true })
    lastData = res.data
    data.push(...lastData)
    cursor = res.headers['x-aptos-cursor']
  } while (lastData.length === 9999)
  return data
}

const fetchVolume: FetchV2 = async ({ fromTimestamp, toTimestamp, createBalances }) => {
  const account_resource: any[] = (await getResources(account))
  const pools = account_resource.filter(e => e.type?.includes('swap::PairEventHolder'))
    .map((e: any) => {
      const [token0, token1] = getToken(e.type);
      return {
        type: e.type,
        token0,
        token1,
        swap_events: {
          counter: e.data.swap.counter,
          creation_num: e.data.swap.guid.id.creation_num,
        },
        timestamp: e.data.timestamp,
        counter: Number(e.data.swap.counter),
      }
    }).sort((a, b) => b.counter - a.counter)
  const creation_num = [14, 767, 702, 12, 622, 757, 1077, 1092, 5708, 2, 712, 3196]
  const logs_swap: ISwapEventData[] = (await Promise.all(pools
    .filter(e => creation_num.includes(Number(e.swap_events.creation_num)))
    .map(p => getSwapEvent(p, fromTimestamp, toTimestamp)))).flat()
  const numberOfTrade: any = {};
  // debugger
  [...new Set(logs_swap.map(e => e.user))].forEach(e => {
    numberOfTrade[e] = {};
    numberOfTrade[e]['user'] = e;
    numberOfTrade[e]['count'] = 0;
    numberOfTrade[e]['volume'] = 0;
  })
  const balances: sdk.Balances = createBalances()
  logs_swap.map((e: ISwapEventData) => {
    const [token0, token1] = getToken(e.type);
    balances.add(token0, e.amount_x_out)
    balances.add(token1, e.amount_y_out)
  })

  // fees are same as v2 on bsc
  const dailyVolume = await balances.getUSDString()
  const dailyFees = Number(dailyVolume) * FEE_CONFIG.V2_V3.Fees;
  const dailyRevenue = Number(dailyVolume) * FEE_CONFIG.V2_V3.Revenue;
  const dailyProtocolRevenue = Number(dailyVolume) * FEE_CONFIG.V2_V3.ProtocolRevenue;
  const dailySupplySideRevenue = Number(dailyVolume) * FEE_CONFIG.V2_V3.SupplySideRevenue;
  const dailyHoldersRevenue = Number(dailyVolume) * FEE_CONFIG.V2_V3.HoldersRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
}

function explorerApiEndpoint(version: 2 | 3, explorerChainSlug: string): string {
  return `https://explorer.pancakeswap.com/api/cached/protocol/v${version}/${explorerChainSlug}/stats`;
}
async function getDataFromPancakeExplorer(version: 2 | 3, chainConfig: ChainConfig): Promise<FetchResult>{
  if (chainConfig.dataSource === DataSource.PANCAKE_EXPLORER) {
    const stats = await httpGet(explorerApiEndpoint(version, chainConfig.explorerChainSlug));
    return {
      dailyVolume: Number(stats.volumeUSD24h),
      dailyFees: Number(stats.totalFeeUSD24h) - Number(stats.totalFeeUSD48h),
    }
  } else {
    throw Error('invalid ChainConfig for pancakeswap adapter');
  }
}

export const PANCAKESWAP_V3_DUNE_QUERY = `
  SELECT 
      -- Total volume including all tokens (for dailyVolume reporting)
      sum(amount_usd) as inflated_volume,
      
      -- Volume excluding problematic tokens (for fee calculations)
      sum(
          CASE 
              WHEN token_sold_address NOT IN (
                  0xc71b5f631354be6853efe9c3ab6b9590f8302e81,  -- ZK
                  0xe6df05ce8c8301223373cf5b969afcb1498c5528,  -- KOGE
                  0xa0c56a8c0692bd10b3fa8f8ba79cf5332b7107f9,  -- MERL
                  0xb4357054c3da8d46ed642383f03139ac7f090343,
                  0x6bdcce4a559076e37755a78ce0c06214e59e4444,
                  0x87d00066cf131ff54b72b134a217d5401e5392b6,
                  0x30c60b20c25b2810ca524810467a0c342294fc61,
                  0xd82544bf0dfe8385ef8fa34d67e6e4940cc63e16,
                  0x595e21b20e78674f8a64c1566a20b2b316bc3511,
                  0x783c3f003f172c6ac5ac700218a357d2d66ee2a2,
                  0xb9e1fd5a02d3a33b25a14d661414e6ed6954a721,
                  0x95034f653D5D161890836Ad2B6b8cc49D14e029a,
                  0xFf7d6A96ae471BbCD7713aF9CB1fEeB16cf56B41
              )
              AND token_bought_address NOT IN (
                  0xc71b5f631354be6853efe9c3ab6b9590f8302e81,  -- ZK
                  0xe6df05ce8c8301223373cf5b969afcb1498c5528,  -- KOGE
                  0xa0c56a8c0692bd10b3fa8f8ba79cf5332b7107f9,  -- MERL
                  0xb4357054c3da8d46ed642383f03139ac7f090343,
                  0x6bdcce4a559076e37755a78ce0c06214e59e4444,
                  0x87d00066cf131ff54b72b134a217d5401e5392b6,
                  0x30c60b20c25b2810ca524810467a0c342294fc61,
                  0xd82544bf0dfe8385ef8fa34d67e6e4940cc63e16,
                  0x595e21b20e78674f8a64c1566a20b2b316bc3511,
                  0x783c3f003f172c6ac5ac700218a357d2d66ee2a2,
                  0xb9e1fd5a02d3a33b25a14d661414e6ed6954a721,
                  0x95034f653D5D161890836Ad2B6b8cc49D14e029a,
                  0xFf7d6A96ae471BbCD7713aF9CB1fEeB16cf56B41
              )
              THEN amount_usd 
              ELSE 0 
          END
      ) as total_volume
  FROM dex.trades
  WHERE blockchain = 'bnb'
      AND TIME_RANGE
      AND project = 'pancakeswap'
      AND version = '3'
`;



const getSwapEvent = async (pool: any, fromTimestamp: number, toTimestamp: number): Promise<ISwapEventData[]> => {
  const limit = 100;
  const swap_events: any[] = [];
  let start = (pool.swap_events.counter - limit) < 0 ? 0 : pool.swap_events.counter - limit;
  while (true) {
    if (start < 0) break;
    const getEventByCreation = `${APTOS_RPC}/v1/accounts/${account}/events/${pool.swap_events.creation_num}?start=${start}&limit=${limit}`;
    try {
      const event: any[] = (await httpGet(getEventByCreation));
      const listSequence: number[] = event.map(e => Number(e.sequence_number))
      const lastMin = Math.min(...listSequence)
      if (lastMin >= Infinity || lastMin <= -Infinity) break;
      const lastVision = event.find(e => Number(e.sequence_number) === lastMin)?.version;
      const urlBlock = `${APTOS_RPC}/v1/blocks/by_version/${lastVision}`;
      const block = (await httpGet(urlBlock));
      const lastTimestamp = toUnixTime(block.block_timestamp);
      const lastTimestampNumber = lastTimestamp
      if (lastTimestampNumber >= fromTimestamp && lastTimestampNumber <= toTimestamp) {
        swap_events.push(...event)
      }
      if (lastTimestampNumber < fromTimestamp) {
        break;
      }
      if (start === 0) break;
      start = lastMin - (limit + 1) > 0 ? lastMin - (limit + 1) : 0;
    } catch (e: any) {
      break;
      // start = start - 26 > 0 ? start - 26 : 0;
    }
  }
  return swap_events.map(e => {
    return {
      ...e,
      type: e.type,
      ...e.data
    }
  })
}
const toUnixTime = (timestamp: string) => Number((Number(timestamp) / 1e6).toString().split('.')[0])

const calculateFeesDune = (dailyVolume: string | Number, feeConfig: typeof FEE_CONFIG.V2_V3) => {
  if (!dailyVolume) return {};
  const dailyVolumeNumber = Number(dailyVolume) || 0;

  return {
    dailyFees: (dailyVolumeNumber * feeConfig.Fees / 100).toString() || "0",
    dailyUserFees: (dailyVolumeNumber * feeConfig.UserFees / 100).toString() || "0",
    dailyRevenue: (dailyVolumeNumber * feeConfig.Revenue / 100).toString() || "0",
    dailyProtocolRevenue: (dailyVolumeNumber * feeConfig.ProtocolRevenue / 100).toString() || "0",
    dailySupplySideRevenue: (dailyVolumeNumber * feeConfig.SupplySideRevenue / 100).toString() || "0", 
    dailyHoldersRevenue: (dailyVolumeNumber * feeConfig.HoldersRevenue / 100).toString() || "0",
  };
};

const calculateFeesBalances = (dailyVolume: sdk.Balances, feeConfig: typeof FEE_CONFIG.V2_V3) => {
  return {
    dailyFees: dailyVolume.clone(feeConfig.Fees/100),
    dailyUserFees: dailyVolume.clone(feeConfig.UserFees/100),
    dailyRevenue: dailyVolume.clone(feeConfig.Revenue/100),
    dailyProtocolRevenue: dailyVolume.clone(feeConfig.ProtocolRevenue/100),
    dailySupplySideRevenue: dailyVolume.clone(feeConfig.SupplySideRevenue/100),
    dailyHoldersRevenue: dailyVolume.clone(feeConfig.HoldersRevenue/100),
  };
};

const fetchV2 = async (_t: any, _a: any, options: FetchOptions) => {
  const chainConfig = PROTOCOL_CONFIG.v2[options.chain];
  
  if (chainConfig.dataSource === DataSource.LOGS) {
    const logConfig = chainConfig as LogsChainConfig;
    const adapter = getUniV2LogAdapter({ 
      factory: logConfig.factory, 
      eventAbi: ABIS.V2.SWAP_EVENT, 
      pairCreatedAbi: ABIS.V2.POOL_CREATE
    });
    const v2stats = await adapter(options);
    return {
      ...v2stats,
      ...calculateFeesBalances(v2stats.dailyVolume, FEE_CONFIG.V2_V3)
    };
  } else if (chainConfig.dataSource === DataSource.GRAPH) {
    const v2stats = await graphs(options);
    return v2stats;
  } else if (chainConfig.dataSource === DataSource.CUSTOM && options.chain === CHAIN.APTOS) {
    return fetchVolume(options);
  } else if (chainConfig.dataSource === DataSource.CUSTOM && options.chain === CHAIN.BSC) {
    return await getBscV2Data(options);
  }
  throw new Error('Invalid data source');
}

const fetchV3 = async (_t: any, _a: any, options: FetchOptions) => {
  const chainConfig = PROTOCOL_CONFIG.v3[options.chain];
  
  if (chainConfig.dataSource === DataSource.LOGS) {
    const logConfig = chainConfig as LogsChainConfig;
    const adapter = getUniV3LogAdapter({ 
      factory: logConfig.factory, 
      poolCreatedEvent: ABIS.V3.POOL_CREATE, 
      swapEvent: ABIS.V3.SWAP_EVENT 
    });
    return await adapter(options);   
  } else if (chainConfig.dataSource === DataSource.GRAPH) {
    const v3stats = await v3Graph(options);
    // Ethereum-specific adjustment
    if (options.chain === CHAIN.ETHEREUM) {
      v3stats.totalVolume = (Number(v3stats.totalVolume) - 7385565913).toString();
    }
    return v3stats;
  } else if (chainConfig.dataSource === DataSource.PANCAKE_EXPLORER) {
    return await getDataFromPancakeExplorer(3, chainConfig)
  } else if (chainConfig.dataSource === DataSource.DUNE) {
    const results = await queryDuneSql(options, PANCAKESWAP_V3_DUNE_QUERY);
    
    const totalVolume = results[0]?.total_volume || 0;
    const inflated_volume = results[0]?.inflated_volume || 0;
    
    // Use total volume for reporting, non-excluded volume for fee calculations
    const dailyFees = inflated_volume * FEE_CONFIG.V2_V3.Fees;
    
    return {
      dailyVolume: totalVolume.toString(),
      dailyFees: dailyFees.toString(),
      ...calculateFeesDune(inflated_volume.toString(), FEE_CONFIG.V2_V3)
    };
  }
  throw new Error('Invalid data source');
}

const fetchStableSwap = async (options: FetchOptions, {factory}: {factory: string}) => {
    const cacheKey = `tvl-adapter-cache/cache/logs/${options.chain}/${factory.toLowerCase()}.json`
    let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true })
    const eventAbi = 'event NewStableSwapPair(address indexed swapContract, address tokenA, address tokenB, address tokenC, address LP)'
    const iface = new ethers.Interface([eventAbi])
    logs = logs.map((log: any) => iface.parseLog(log)?.args)
    const pairs = logs.filter((log: any) => log.swapContract)
    const _token0: string[] = pairs.map((pair: any) => pair.tokenA)
    const _token1: string[] = pairs.map((pair: any) => pair.tokenB)
    const _token2: string[] = pairs.map((pair: any) => pair.tokenC)
    const swap_logs = await options.getLogs({ 
      targets: pairs.map((pair: any) => pair.swapContract), 
      eventAbi: 'event TokenExchange(address indexed buyer,uint256 sold_id,uint256 tokens_sold,uint256 bought_id,uint256 tokens_bought)',
      flatten: false
    })
    const dailyVolume = options.createBalances()
    swap_logs.map((logs: any, index: number) => {
      logs.map((log: any) => {
        const tokens = [_token0[index], _token1[index], _token2[index]]
        const sold_id = log.sold_id
        const tokens_sold = log.tokens_sold
        dailyVolume.add(tokens[sold_id], tokens_sold)
      })
    })
    const dailyFees = dailyVolume.clone(FEE_CONFIG.STABLESWAP.Fees/100)
    const dailyProtocolRevenue = dailyVolume.clone(FEE_CONFIG.STABLESWAP.ProtocolRevenue/100)
    const dailySupplySideRevenue = dailyVolume.clone(FEE_CONFIG.STABLESWAP.SupplySideRevenue/100)
    const dailyHoldersRevenue = dailyVolume.clone(FEE_CONFIG.STABLESWAP.HoldersRevenue/100)
    const dailyUserFees = dailyVolume.clone(FEE_CONFIG.STABLESWAP.UserFees/100)
    const dailyRevenue = dailyVolume.clone(FEE_CONFIG.STABLESWAP.Revenue/100)
    return {
      dailyVolume: dailyVolume,
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue,
      dailyUserFees,
    }
}

const createAdapter = (version: keyof typeof PROTOCOL_CONFIG) => {
  const versionConfig = PROTOCOL_CONFIG[version];
  const chains = Object.keys(versionConfig);
  
  return chains.reduce((acc, chain) => {
    const config = versionConfig[chain];
    
    if (version === 'v1' && chain === CHAIN.BSC) {
      const customConfig = config as CustomChainConfig;
      acc[chain] = {
        fetch: async (_t: any, _a: any, { startTimestamp }: any) => {
          return {
            totalVolume: customConfig.totalVolume,
            timestamp: startTimestamp
          }
        },
        start: config.start,
      };
    } else if (version === 'v2') {
      acc[chain] = {
        fetch: fetchV2,
        start: config.start,
      };
    } else if (version === 'v3') {
      acc[chain] = {
        fetch: fetchV3,
        start: config.start,
        runAtCurrTime: versionConfig[chain].dataSource === DataSource.PANCAKE_EXPLORER,
      };
    } else if (version === 'stableswap') {
      acc[chain] = {
        fetch: chain === CHAIN.ETHEREUM ? (_t: any, _a: any, options: FetchOptions) => fetchStableSwap(options, {factory: '0xD173bf0851D2803177CC3928CF52F7b6bd29D054'}) : (_t: any, _a: any, options: FetchOptions) => graphsStableSwap(options),
        start: config.start,
      };
    }
    
    return acc;
  }, {} as BaseAdapter);
};

const adapter: BreakdownAdapter = {
  breakdown: {
    v1: createAdapter('v1'),
    v2: createAdapter('v2'),
    v3: createAdapter('v3'),
    stableswap: createAdapter('stableswap')
  },
  dependencies: [Dependencies.DUNE],
};

export default adapter;
