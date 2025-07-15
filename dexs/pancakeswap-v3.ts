import axios from "axios";
import { BaseAdapter, SimpleAdapter, FetchOptions } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { getUniV3LogAdapter } from "../helpers/uniswap";
import * as sdk from '@defillama/sdk';

// Import the necessary components from the main pancakeswap adapter
import { PROTOCOL_CONFIG, FEE_CONFIG, PANCAKESWAP_V3_DUNE_QUERY } from './pancakeswap';

// Get the V3_CONFIG from the main adapter
const V3_CONFIG = PROTOCOL_CONFIG.v3;

const ABIS = {
  POOL_CREATE: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  SWAP_EVENT: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'
};

// Create endpoints map for graph chains
const createEndpointMap = () => {
  const result: Record<string, string> = {};
  
  Object.entries(V3_CONFIG).forEach(([chain, config]) => {
    if (config.dataSource === 'graph' && 'endpoint' in config && config.endpoint) {
      result[chain] = config.endpoint;
    }
  });
  
  return result;
};

const v3Endpoints = createEndpointMap();

const v3Graph = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
  },
  totalFees: {
    factory: "factories",
  },
});

const calculateFees = (dailyFees: number) => {
  return {
    dailyFees: dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees * FEE_CONFIG.V2_V3.Revenue / FEE_CONFIG.V2_V3.Fees,
    dailyProtocolRevenue: dailyFees * FEE_CONFIG.V2_V3.ProtocolRevenue / FEE_CONFIG.V2_V3.Fees,
    dailySupplySideRevenue: dailyFees * FEE_CONFIG.V2_V3.SupplySideRevenue / FEE_CONFIG.V2_V3.Fees,
    dailyHoldersRevenue: dailyFees * FEE_CONFIG.V2_V3.HoldersRevenue / FEE_CONFIG.V2_V3.Fees,
  };
};

const calculateFeesBalances = (dailyFees: sdk.Balances) => {
  return {
    dailyFees: dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees.clone(FEE_CONFIG.V2_V3.Revenue/FEE_CONFIG.V2_V3.Fees),
    dailyProtocolRevenue: dailyFees.clone(FEE_CONFIG.V2_V3.ProtocolRevenue/FEE_CONFIG.V2_V3.Fees),
    dailySupplySideRevenue: dailyFees.clone(FEE_CONFIG.V2_V3.SupplySideRevenue/FEE_CONFIG.V2_V3.Fees),
    dailyHoldersRevenue: dailyFees.clone(FEE_CONFIG.V2_V3.HoldersRevenue/FEE_CONFIG.V2_V3.Fees),
  };
};

// Custom Dune SQL query for PancakeSwap V3
const fetchV3Dune = async (_a:any, _b:any, options: FetchOptions) => {
  const results = await queryDuneSql(options, PANCAKESWAP_V3_DUNE_QUERY);
  
  const totalVolume = results[0]?.total_volume || 0;

  const dailyFees = totalVolume * 0.0025;
  const dailyRevenue = totalVolume * 0.0008;
  const dailyProtocolRevenue = totalVolume * 0.000225; // 0.0225%
  const dailySupplySideRevenue = totalVolume * 0.0017; // 0.17%
  const dailyHoldersRevenue = totalVolume * 0.000575; // 0.0575%
  const dailyUserFees = totalVolume * 0.0025; // 0.25%

  return {
    dailyVolume: totalVolume.toString(),
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
    dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    dailySupplySideRevenue: dailySupplySideRevenue.toString(),
    dailyHoldersRevenue: dailyHoldersRevenue.toString(),
    dailyUserFees: dailyUserFees.toString(),
  };
};

// Main fetchV3 function adapted for v1 format
const fetchV3 = async (_a: any, _b: any, options: FetchOptions) => {
  const chainConfig = V3_CONFIG[options.chain];
  
  if (!chainConfig) {
    throw new Error(`Chain ${options.chain} not supported for PancakeSwap V3`);
  }
  
  if (chainConfig.dataSource === 'logs') {
    const adapter = getUniV3LogAdapter({ 
      factory: (chainConfig as any).factory, 
      poolCreatedEvent: ABIS.POOL_CREATE, 
      swapEvent: ABIS.SWAP_EVENT 
    });
    const v2stats = await adapter(options);
    return {
      ...v2stats,
      ...calculateFeesBalances(v2stats.dailyFees),
    }
  } else if (chainConfig.dataSource === 'graph') {
    const v3stats = await v3Graph(options.chain)(options);
    // Ethereum-specific adjustment
    // if (options.chain === CHAIN.ETHEREUM) {
    //   v3stats.totalVolume = (Number(v3stats.totalVolume) - 7385565913).toString();
    // }
    return {
      ...v3stats,
      ...calculateFees(Number(v3stats.dailyFees)),
    };
  } else if (chainConfig.dataSource === 'dune') {
    return await fetchV3Dune(_a, _b, options);
  }
  throw new Error('Invalid data source');
};

const pancakeSolanaExplorer = 'https://sol-explorer.pancakeswap.com/api/cached/v1/pools/info/list?poolType=concentrated&poolSortField=default&order=desc'
const blacklistPools = [
  'EbkGwrT4zf7Hczrn23zyoPJHThd2NHguJnyWiJe9wf9D',
];
const fetchSolanaV3 = async (_a: any, _b: any, _: FetchOptions) => {

  let dailyVolume = 0;
  let dailyFees = 0;

  let page = 1;
  let allPools: Array<any> = [];
  do {
    const response = await axios.get(`${pancakeSolanaExplorer}&pageSize=100&page=${page}`);
    const pools = response.data.data;
    if (pools.length == 0) {
      break;
    }
    allPools = allPools.concat(pools);

    page += 1;
  } while(true)

  for (const pool of allPools.filter(pool => !blacklistPools.includes(pool.id))) {
    dailyVolume += Number(pool.day.volume);
    dailyFees += Number(pool.day.volumeFee);
  }

  return {
    dailyVolume,
    ...calculateFees(dailyFees),
  }
}

const createV3Adapter = () => {
  const chains = Object.keys(V3_CONFIG);
  
  return chains.reduce((acc, chain) => {
    const config = V3_CONFIG[chain];
    
    acc[chain] = {
      fetch: fetchV3,
      start: config.start,
    };
    
    return acc;
  }, {} as BaseAdapter);
};

const adapters = createV3Adapter();

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    ...adapters,
    solana: {
      fetch: fetchSolanaV3,
      runAtCurrTime: true,
    }
  }
};

export default adapter;