import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { filterPools2 } from "../../helpers/uniswap";

const CONFIG = {
  factory: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A'
}

const topics = {
  event_poolCreated: '0xab0d57f0df537bb25e80245ef7748fa62353808c54d6e528a9dd20887aed9ac2',
  event_swap: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'
}

const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
}

const abis = {
  fee: 'uint256:fee'
}

type PoolInfo = {
  pair: string;
  token0: string;
  token1: string;
  logs: any
};

const fetch = async (_:any, _1:any, fetchOptions: FetchOptions): Promise<FetchResult> => {
  // const startTime = Date.now();
  const { api, createBalances, getToBlock, getFromBlock, chain, getLogs } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

  const rawPools = await getLogs({ target: CONFIG.factory, fromBlock: 13843704, toBlock, topics: [topics.event_poolCreated], eventAbi: eventAbis.event_poolCreated }) 
  const pools = rawPools.map(([token0, token1, _tick, pair]) => ({ pair, token0, token1 }))

  const { pairs, token0s, token1s } = await filterPools2({
    fetchOptions,
    pairs: pools.map(p => p.pair),
    token0s: pools.map(p => p.token0),
    token1s: pools.map(p => p.token1),
    minUSDValue: 2000,
    maxPairSize: 1000
  })

  const filteredPools: PoolInfo[] = pairs.map((pair: string, index: number) => ({ pair, token0: token0s[index], token1: token1s[index] }));
  const fees = await api.multiCall({ calls: filteredPools.map(({ pair }) => ({ target: pair })), abi: abis.fee });
  const poolsAndFees = filteredPools.map((pool, index) => ({ ...pool, fees: fees[index] / 1e6, logs: [] as any[] }));

  const blockStep = 5000;
  const poolChunkSize = 10;

  for (let i = 0; i < poolsAndFees.length; i += poolChunkSize) {
    const chunkPools = poolsAndFees.slice(i, i + poolChunkSize);

    for (let startBlock = fromBlock; startBlock <= toBlock; startBlock += blockStep) {
      const endBlock = Math.min(startBlock + blockStep - 1, toBlock);

      const logsChunk = await Promise.all(
        chunkPools.map(async (pool) => {
          const logs = await sdk.indexer.getLogs({
            chain,
            target: pool.pair,
            fromBlock: startBlock,
            toBlock: endBlock,
            topics: [topics.event_swap],
            eventAbi: eventAbis.event_swap,
            all: true
          });
          return { pool, logs };
        })
      );

      for (const { pool, logs } of logsChunk) {
        pool.logs.push(...logs);
      }
    }
  }

  // const totalPools = poolsAndFees.length;
  // let totalLogs = 0;
  // const logsByPool = poolsAndFees.map(pool => {
  //   const logCount = pool.logs.length;
  //   totalLogs += logCount;
  //   return { pool: pool.pair, logCount };
  // });

  // const runtime = Date.now() - startTime;
  // console.log(`Script execution time: ${runtime} ms`);
  // console.log(`Total number of poolsAndFees: ${totalPools}`);
  // console.log(`Total number of logs: ${totalLogs}`);
  // console.table(logsByPool);

  for (const pool of poolsAndFees) {
    const { token0, token1, fees = 0, logs = [] } = pool;

    logs.forEach((log: any) => {
      const amount0 = Number(log[2])
      const amount1 = Number(log[3])
      const fee0 = amount0 * fees
      const fee1 = amount1 * fees

      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 })
    })
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
}

const adapters: SimpleAdapter = {
  version: 1,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2024-05-03',
    }
  }
}
export default adapters;
