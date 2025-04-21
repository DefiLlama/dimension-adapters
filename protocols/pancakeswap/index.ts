import { BaseAdapter, BreakdownAdapter, DISABLED_ADAPTER_KEY, FetchOptions, FetchV2, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import disabledAdapter from "../../helpers/disabledAdapter";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph"
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";
import * as sdk from "@defillama/sdk";
import fetchURL, { httpGet } from "../../utils/fetchURL";
import { getEnv } from "../../helpers/env";
import { Balances } from "@defillama/sdk";

enum DataSource {
  GRAPH = 'graph',
  LOGS = 'logs',
  CUSTOM = 'custom'
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

interface CustomChainConfig extends BaseChainConfig {
  dataSource: DataSource.CUSTOM;
  totalVolume?: number;
}

type ChainConfig = GraphChainConfig | LogsChainConfig | CustomChainConfig;

const PROTOCOL_CONFIG: Record<string, Record<string, ChainConfig>> = {
  v1: {
    [CHAIN.BSC]: {
      start: '2023-04-01',
      dataSource: DataSource.CUSTOM,
      totalVolume: 103394400000
    }
  },
  v2: {
    [CHAIN.BSC]: {
      start: 1619136000,
      dataSource: DataSource.GRAPH,
      endpoint: "https://proxy-worker.pancake-swap.workers.dev/bsc-exchange",
      requestHeaders: {
        "origin": "https://pancakeswap.finance",
      }
    },
    [CHAIN.ETHEREUM]: {
      start: 1664236800,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('9opY17WnEPD4REcC43yHycQthSeUMQE26wyoeMjZTLEx')
    },
    [CHAIN.POLYGON_ZKEVM]: {
      start: 1687910400,
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('37WmH5kBu6QQytRpMwLJMGPRbXvHgpuZsWqswW4Finc2'),
      factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E'
    },
    [CHAIN.ERA]: {
      start: 1690156800,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('6dU6WwEz22YacyzbTbSa3CECCmaD8G7oQ8aw6MYd5VKU')
    },
    [CHAIN.ARBITRUM]: {
      start: 1691452800,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('EsL7geTRcA3LaLLM9EcMFzYbUgnvf8RixoEEGErrodB3')
    },
    [CHAIN.LINEA]: {
      start: 1692835200,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('Eti2Z5zVEdARnuUzjCbv4qcimTLysAizsqH3s6cBfPjB')
    },
    [CHAIN.BASE]: {
      start: 1693440000,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('2NjL7L4CmQaGJSacM43ofmH6ARf6gJoBeBaJtz9eWAQ9')
    },
    [CHAIN.OP_BNB]: {
      start: 1695081600,
      dataSource: DataSource.LOGS,
      // endpoint: `${getEnv('PANCAKESWAP_OPBNB_SUBGRAPH')}/subgraphs/name/pancakeswap/exchange-v2`,
      factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E'
    },
    [CHAIN.APTOS]: {
      start: '2023-11-09',
      dataSource: DataSource.CUSTOM
    }
  },
  v3: {
    [CHAIN.BSC]: {
      start: 1680307200,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('A1fvJWQLBeUAggX2WQTMm3FKjXTekNXo77ZySun4YN2m')
    },
    [CHAIN.ETHEREUM]: {
      start: 1680307200,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('CJYGNhb7RvnhfBDjqpRnD3oxgyhibzc7fkAMa38YV3oS')
    },
    [CHAIN.POLYGON_ZKEVM]: {
      start: 1686182400,
      dataSource: DataSource.LOGS,
      // endpoint: sdk.graph.modifyEndpoint('7HroSeAFxfJtYqpbgcfAnNSgkzzcZXZi6c75qLPheKzQ'),
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'
    },
    [CHAIN.ERA]: {
      start: 1690156800,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('3dKr3tYxTuwiRLkU9vPj3MvZeUmeuGgWURbFC72ZBpYY')
    },
    [CHAIN.ARBITRUM]: {
      start: 1691452800,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('251MHFNN1rwjErXD2efWMpNS73SANZN8Ua192zw6iXve')
    },
    [CHAIN.LINEA]: {
      start: 1692835200,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('6gCTVX98K3A9Hf9zjvgEKwjz7rtD4C1V173RYEdbeMFX')
    },
    [CHAIN.BASE]: {
      start: 1692576000,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('5YYKGBcRkJs6tmDfB3RpHdbK2R5KBACHQebXVgbUcYQp')
    },
    [CHAIN.OP_BNB]: {
      start: 1693440000,
      dataSource: DataSource.LOGS,
      // endpoint: `${getEnv('PANCAKESWAP_OPBNB_SUBGRAPH')}/subgraphs/name/pancakeswap/exchange-v3`,
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'
    }
  },
  stableswap: {
    [CHAIN.ETHEREUM]: {
      start: 1705363200,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('CoKbk4ey7JFGodyx1psQ21ojW4UhSoWBVcCTxTwEuJUj')
    },
    [CHAIN.BSC]: {
      start: 1663718400,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('C5EuiZwWkCge7edveeMcvDmdr7jjc1zG4vgn8uucLdfz')
    },
    [CHAIN.ARBITRUM]: {
      start: 1705363200,
      dataSource: DataSource.GRAPH,
      endpoint: sdk.graph.modifyEndpoint('y7G5NUSq5ngsLH2jBGQajjxuLgW1bcqWiBqKmBk3MWM')
    }
  }
};

const FEE_CONFIG = {
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
    Revenue: 0.0225
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

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.0225% of each swap.",
  SupplySideRevenue: "LPs receive 0.17% of the fees.",
  HoldersRevenue: "0.0575% is used to facilitate CAKE buyback and burn.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const stableSwapMethodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 10% of the fees.",
  SupplySideRevenue: "LPs receive 50% of the fees.",
  HoldersRevenue: "A 40% of the fees is used to facilitate CAKE buyback and burn.",
  Revenue: "Revenue is 50% of the fees paid by users.",
  Fees: "All fees comes from the user fees, which is 025% of each trade."
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
const APTOS_PRC = 'https://aptos-mainnet.pontem.network';

const getResources = async (account: string): Promise<any[]> => {
  const data: any = []
  let lastData: any;
  let cursor
  do {
    let url = `${APTOS_PRC}/v1/accounts/${account}/resources?limit=9999`
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

  return {
    dailyVolume: await balances.getUSDString(),
    dailyFees: "0",
  }
}

const getSwapEvent = async (pool: any, fromTimestamp: number, toTimestamp: number): Promise<ISwapEventData[]> => {
  const limit = 100;
  const swap_events: any[] = [];
  let start = (pool.swap_events.counter - limit) < 0 ? 0 : pool.swap_events.counter - limit;
  while (true) {
    if (start < 0) break;
    const getEventByCreation = `${APTOS_PRC}/v1/accounts/${account}/events/${pool.swap_events.creation_num}?start=${start}&limit=${limit}`;
    try {
      const event: any[] = (await httpGet(getEventByCreation));
      const listSequence: number[] = event.map(e => Number(e.sequence_number))
      const lastMin = Math.min(...listSequence)
      if (lastMin >= Infinity || lastMin <= -Infinity) break;
      const lastVision = event.find(e => Number(e.sequence_number) === lastMin)?.version;
      const urlBlock = `${APTOS_PRC}/v1/blocks/by_version/${lastVision}`;
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

const calculateFees = (dailyVolume: string | Number, feeConfig: typeof FEE_CONFIG.V2_V3) => {
  if (!dailyVolume) return {};
  const dailyVolumeNumber = Number(dailyVolume) || 0;

  return {
    dailyProtocolRevenue: (dailyVolumeNumber * feeConfig.ProtocolRevenue).toString() || "0",
    dailySupplySideRevenue: (dailyVolumeNumber * feeConfig.SupplySideRevenue).toString() || "0", 
    dailyHoldersRevenue: (dailyVolumeNumber * feeConfig.HoldersRevenue).toString() || "0",
    dailyUserFees: (dailyVolumeNumber * feeConfig.UserFees).toString() || "0",
  };
};

const fetchV2 = async (options: FetchOptions) => {
  const chainConfig = PROTOCOL_CONFIG.v2[options.chain];
  
  if (chainConfig.dataSource === DataSource.LOGS) {
    const logConfig = chainConfig as LogsChainConfig;
    const adapter = getUniV2LogAdapter({ 
      factory: logConfig.factory, 
      eventAbi: ABIS.V2.SWAP_EVENT, 
      pairCreatedAbi: ABIS.V2.POOL_CREATE 
    });
    const v2stats = await adapter(options);
    const usdDailyVolume = await v2stats.dailyVolume.toString();
    return {
      ...v2stats,
      ...calculateFees(usdDailyVolume, FEE_CONFIG.V2_V3)
    };
  } else if (chainConfig.dataSource === DataSource.GRAPH) {
    const v2stats = await graphs(options.chain)(options);
    return v2stats;
  } else if (chainConfig.dataSource === DataSource.CUSTOM && options.chain === CHAIN.APTOS) {
    return fetchVolume(options);
  }
  throw new Error('Invalid data source');
}

const fetchV3 = async (options: FetchOptions) => {
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
    const v3stats = await v3Graph(options.chain)(options);
    // Ethereum-specific adjustment
    if (options.chain === CHAIN.ETHEREUM) {
      v3stats.totalVolume = (Number(v3stats.totalVolume) - 7385565913).toString();
    }
    return v3stats;
  }
  throw new Error('Invalid data source');
}

const createAdapter = (version: keyof typeof PROTOCOL_CONFIG) => {
  const versionConfig = PROTOCOL_CONFIG[version];
  const chains = Object.keys(versionConfig);
  
  return chains.reduce((acc, chain) => {
    const config = versionConfig[chain];
    
    if (version === 'v1' && chain === CHAIN.BSC) {
      const customConfig = config as CustomChainConfig;
      acc[chain] = {
        fetch: async ({ startTimestamp }) => {
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
        meta: { methodology }
      };
    } else if (version === 'v3') {
      acc[chain] = {
        fetch: fetchV3,
        start: config.start
      };
    } else if (version === 'stableswap') {
      acc[chain] = {
        fetch: graphsStableSwap(chain),
        start: config.start,
        meta: { methodology: stableSwapMethodology }
      };
    }
    
    return acc;
  }, {} as BaseAdapter);
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      ...createAdapter('v1')
    },
    v2: createAdapter('v2'),
    v3: createAdapter('v3'),
    stableswap: createAdapter('stableswap')
  },
};

export default adapter;
