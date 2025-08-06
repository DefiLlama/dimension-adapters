// import axios from "axios";
// import { BaseAdapter, SimpleAdapter, FetchOptions } from "../adapters/types";
// import { queryDuneSql } from "../helpers/dune";
// import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
// import { getUniV3LogAdapter } from "../helpers/uniswap";
// import * as sdk from '@defillama/sdk';

// // Import the necessary components from the main pancakeswap adapter
// import { PROTOCOL_CONFIG, FEE_CONFIG, PANCAKESWAP_V3_DUNE_QUERY } from './pancakeswap';

// // Get the V3_CONFIG from the main adapter
// const V3_CONFIG = PROTOCOL_CONFIG.v3;

// const ABIS = {
//   POOL_CREATE: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
//   SWAP_EVENT: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'
// };

// // Create endpoints map for graph chains
// const createEndpointMap = () => {
//   const result: Record<string, string> = {};
  
//   Object.entries(V3_CONFIG).forEach(([chain, config]) => {
//     if (config.dataSource === 'graph' && 'endpoint' in config && config.endpoint) {
//       result[chain] = config.endpoint;
//     }
//   });
  
//   return result;
// };

// const v3Endpoints = createEndpointMap();

// const v3Graph = getGraphDimensions2({
//   graphUrls: v3Endpoints,
//   totalVolume: {
//     factory: "factories",
//   },
//   totalFees: {
//     factory: "factories",
//   },
// });

// const calculateFees = (dailyFees: number) => {
//   return {
//     dailyFees: dailyFees,
//     dailyUserFees: dailyFees,
//     dailyRevenue: dailyFees * FEE_CONFIG.V2_V3.Revenue / FEE_CONFIG.V2_V3.Fees,
//     dailyProtocolRevenue: dailyFees * FEE_CONFIG.V2_V3.ProtocolRevenue / FEE_CONFIG.V2_V3.Fees,
//     dailySupplySideRevenue: dailyFees * FEE_CONFIG.V2_V3.SupplySideRevenue / FEE_CONFIG.V2_V3.Fees,
//     dailyHoldersRevenue: dailyFees * FEE_CONFIG.V2_V3.HoldersRevenue / FEE_CONFIG.V2_V3.Fees,
//   };
// };

// const calculateFeesBalances = (dailyFees: sdk.Balances) => {
//   return {
//     dailyFees: dailyFees,
//     dailyUserFees: dailyFees,
//     dailyRevenue: dailyFees.clone(FEE_CONFIG.V2_V3.Revenue/FEE_CONFIG.V2_V3.Fees),
//     dailyProtocolRevenue: dailyFees.clone(FEE_CONFIG.V2_V3.ProtocolRevenue/FEE_CONFIG.V2_V3.Fees),
//     dailySupplySideRevenue: dailyFees.clone(FEE_CONFIG.V2_V3.SupplySideRevenue/FEE_CONFIG.V2_V3.Fees),
//     dailyHoldersRevenue: dailyFees.clone(FEE_CONFIG.V2_V3.HoldersRevenue/FEE_CONFIG.V2_V3.Fees),
//   };
// };

// // Custom Dune SQL query for PancakeSwap V3
// const fetchV3Dune = async (_a:any, _b:any, options: FetchOptions) => {
//   const results = await queryDuneSql(options, PANCAKESWAP_V3_DUNE_QUERY);
  
//   const totalVolume = results[0]?.total_volume || 0;

//   const dailyFees = totalVolume * 0.0025;
//   const dailyRevenue = totalVolume * 0.0008;
//   const dailyProtocolRevenue = totalVolume * 0.000225; // 0.0225%
//   const dailySupplySideRevenue = totalVolume * 0.0017; // 0.17%
//   const dailyHoldersRevenue = totalVolume * 0.000575; // 0.0575%
//   const dailyUserFees = totalVolume * 0.0025; // 0.25%

//   return {
//     dailyVolume: totalVolume.toString(),
//     dailyFees: dailyFees.toString(),
//     dailyRevenue: dailyRevenue.toString(),
//     dailyProtocolRevenue: dailyProtocolRevenue.toString(),
//     dailySupplySideRevenue: dailySupplySideRevenue.toString(),
//     dailyHoldersRevenue: dailyHoldersRevenue.toString(),
//     dailyUserFees: dailyUserFees.toString(),
//   };
// };

// // Main fetchV3 function adapted for v1 format
// const fetchV3 = async (_a: any, _b: any, options: FetchOptions) => {
//   const chainConfig = V3_CONFIG[options.chain];
  
//   if (!chainConfig) {
//     throw new Error(`Chain ${options.chain} not supported for PancakeSwap V3`);
//   }
  
//   if (chainConfig.dataSource === 'logs') {
//     const adapter = getUniV3LogAdapter({ 
//       factory: (chainConfig as any).factory, 
//       poolCreatedEvent: ABIS.POOL_CREATE, 
//       swapEvent: ABIS.SWAP_EVENT 
//     });
//     const v2stats = await adapter(options);
//     return {
//       ...v2stats,
//       ...calculateFeesBalances(v2stats.dailyFees),
//     }
//   } else if (chainConfig.dataSource === 'graph') {
//     const v3stats = await v3Graph(options);
//     // Ethereum-specific adjustment
//     // if (options.chain === CHAIN.ETHEREUM) {
//     //   v3stats.totalVolume = (Number(v3stats.totalVolume) - 7385565913).toString();
//     // }
//     return {
//       ...v3stats,
//       ...calculateFees(Number(v3stats.dailyFees)),
//     };
//   } else if (chainConfig.dataSource === 'dune') {
//     return await fetchV3Dune(_a, _b, options);
//   }
//   throw new Error('Invalid data source');
// };

// const pancakeSolanaExplorer = 'https://sol-explorer.pancakeswap.com/api/cached/v1/pools/info/list?poolType=concentrated&poolSortField=default&order=desc'
// const blacklistPools = [
//   'EbkGwrT4zf7Hczrn23zyoPJHThd2NHguJnyWiJe9wf9D',
// ];
// const fetchSolanaV3 = async (_a: any, _b: any, _: FetchOptions) => {

//   let dailyVolume = 0;
//   let dailyFees = 0;

//   let page = 1;
//   let allPools: Array<any> = [];
//   do {
//     const response = await axios.get(`${pancakeSolanaExplorer}&pageSize=100&page=${page}`);
//     const pools = response.data.data;
//     if (pools.length == 0) {
//       break;
//     }
//     allPools = allPools.concat(pools);

//     page += 1;
//   } while(true)

//   for (const pool of allPools.filter(pool => !blacklistPools.includes(pool.id))) {
//     dailyVolume += Number(pool.day.volume);
//     dailyFees += Number(pool.day.volumeFee);
//   }

//   return {
//     dailyVolume,
//     ...calculateFees(dailyFees),
//   }
// }

// const createV3Adapter = () => {
//   const chains = Object.keys(V3_CONFIG);
  
//   return chains.reduce((acc, chain) => {
//     const config = V3_CONFIG[chain];
    
//     acc[chain] = {
//       fetch: fetchV3,
//       start: config.start,
//     };
    
//     return acc;
//   }, {} as BaseAdapter);
// };

// const adapters = createV3Adapter();

// const adapter: SimpleAdapter = {
//   version: 1,
//   adapter: {
//     ...adapters,
//     solana: {
//       fetch: fetchSolanaV3,
//       runAtCurrTime: true,
//     }
//   }
// };

// export default adapter;

import { CHAIN } from "../helpers/chains";
import { cache } from "@defillama/sdk";
import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { ethers } from "ethers";
import { filterPools } from '../helpers/uniswap';
import { addOneToken } from "../helpers/prices";

const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

interface Ifactory {
  address: string;
  start: string;
  blacklistTokens?: Array<string>;
}

const factories: {[key: string]: Ifactory} = {
  [CHAIN.BSC]: {
    start: '2023-04-01',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    blacklistTokens: [
      '0xc71b5f631354be6853efe9c3ab6b9590f8302e81',
      '0xe6df05ce8c8301223373cf5b969afcb1498c5528',
      '0xa0c56a8c0692bd10b3fa8f8ba79cf5332b7107f9',
      '0xb4357054c3da8d46ed642383f03139ac7f090343',
      '0x6bdcce4a559076e37755a78ce0c06214e59e4444',
      '0x87d00066cf131ff54b72b134a217d5401e5392b6',
      '0x30c60b20c25b2810ca524810467a0c342294fc61',
      '0xd82544bf0dfe8385ef8fa34d67e6e4940cc63e16',
      '0x595e21b20e78674f8a64c1566a20b2b316bc3511',
      '0x783c3f003f172c6ac5ac700218a357d2d66ee2a2',
      '0xb9e1fd5a02d3a33b25a14d661414e6ed6954a721',
      '0x95034f653D5D161890836Ad2B6b8cc49D14e029a',
      '0xFf7d6A96ae471BbCD7713aF9CB1fEeB16cf56B41',
    ]
  },
  [CHAIN.ETHEREUM]: {
    start: '2023-04-01',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.POLYGON_ZKEVM]: {
    start: '2023-06-08',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  },
  [CHAIN.ERA]: {
    start: '2023-07-24',
    address: '0x1bb72e0cbbea93c08f535fc7856e0338d7f7a8ab',
  },
  [CHAIN.ARBITRUM]: {
    start: '2023-08-08',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.LINEA]: {
    start: '2023-08-24',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.BASE]: {
    start: '2023-08-21',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.OP_BNB]: {
    start: '2023-08-31',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  },
}

function isBlacklistToken(chain: string, tokenAddress: string): boolean {
  if (factories[chain].blacklistTokens) {
    for (const token of factories[chain].blacklistTokens) {
      if (token.toLowerCase() === tokenAddress.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

// Source: https://docs.pancakeswap.finance/trade/trading-faq/swap-faq#what-will-be-the-trading-fee-breakdown-for-v3-exchange
function getProtocolRevenueRatio(fee: number): number {
  if (fee === 0.0001) return 0.18; // 18% swap fee
  if (fee === 0.0005) return 0.19; // 19% swap fee
  if (fee === 0.0025) return 0.09; // 9% swap fee
  if (fee === 0.01) return 0.09; // 9% swap fee
  return 0;
}

function getHolderRevenueRatio(fee: number): number {
  if (fee === 0.0001) return 0.15; // 15% swap fee
  if (fee === 0.0005) return 0.15; // 15% swap fee
  if (fee === 0.0025) return 0.23; // 23% swap fee
  if (fee === 0.01) return 0.23; // 23% swap fee
  return 0;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const factory = String(factories[options.chain].address).toLowerCase()
  
  if (!options.chain) throw new Error('Wrong version?')
  
  const cacheKey = `tvl-adapter-cache/cache/logs/${options.chain}/${factory}.json`
  const iface = new ethers.Interface([poolCreatedEvent])
  let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!logs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
  logs = logs.map((log: any) => iface.parseLog(log)?.args)

  const pairObject: IJSON<string[]> = {}
  const fees: any = {}
  logs.forEach((log: any) => {
    if (!isBlacklistToken(options.chain, log.token0) && !isBlacklistToken(options.chain, log.token1)) {
      pairObject[log.pool] = [log.token0, log.token1]
      fees[log.pool] = (log.fee?.toString() || 0) / 1e6 // seem some protocol v3 forks does not have fee in the log when not use defaultPoolCreatedEvent
    }
  })
  
  // remove pools with blacklist tokens
  let filteredPairs = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances })

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }

  const allLogs = await options.getLogs({ targets: Object.keys(filteredPairs), eventAbi: poolSwapEvent, flatten: false })
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = Object.keys(filteredPairs)[index]
    const [token0, token1] = pairObject[pair]
    const fee = fees[pair]
    logs.forEach((log: any) => {
      const protocolRevenueRatio = getProtocolRevenueRatio(fee);
      const holdersRevenueRatio = getHolderRevenueRatio(fee);
      const revenueRatio = protocolRevenueRatio + holdersRevenueRatio;
      const supplySideRevenueRatio = 1 - revenueRatio;

      const amount0 = Number(log.amount0)
      const amount1 = Number(log.amount1)

      addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: amount0 * fee, amount1: amount1 * fee })
      addOneToken({ chain: options.chain, balances: dailyRevenue, token0, token1, amount0: amount0 * fee * revenueRatio, amount1: amount1 * fee * revenueRatio })
      addOneToken({ chain: options.chain, balances: dailyProtocolRevenue, token0, token1, amount0: amount0 * fee * protocolRevenueRatio, amount1: amount1 * fee * protocolRevenueRatio })
      addOneToken({ chain: options.chain, balances: dailyHoldersRevenue, token0, token1, amount0: amount0 * fee * holdersRevenueRatio, amount1: amount1 * fee * holdersRevenueRatio })
      addOneToken({ chain: options.chain, balances: dailySupplySideRevenue, token0, token1, amount0: amount0 * fee * supplySideRevenueRatio, amount1: amount1 * fee * supplySideRevenueRatio })
    })
  })
  
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
}

const methodology = {
  Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
  UserFees: "All trading fees paid by users",
  Revenue: "Pancakeswap collects amount of swap fees for Treasury and buy back CAKE.",
  SupplySideRevenue: "Fees distributed to LPs",
  ProtocolRevenue: "Swap fees collected by Pancakeswap - distribute to Treasury",
  HoldersRevenue: "Swap fees collected by Pancakeswap used for buyback and burn CAKE",
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {},
};

for (const [chain, config] of Object.entries(factories)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: fetch,
    start: config.start,
  }
}

export default adapter;
