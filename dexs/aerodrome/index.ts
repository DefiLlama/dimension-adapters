import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { filterPools2 } from "../../helpers/uniswap";

const CONFIG = {
  factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
  voter: '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5'
}

const topics = {
  event_poolCreated: '0x2128d88d14c80cb081c1252a5acff7a264671bf199ce226b53788fb26065005e',
  event_swap: '0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b',
  event_gaugeCreated: '0xef9f7d1ffff3b249c6b9bf2528499e935f7d96bb6d6ec4e7da504d1d3c6279e1',
  event_notify_reward: '0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b'
}

const eventAbis = {
  event_pool_created: 'event PoolCreated(address indexed token0,address indexed token1,bool indexed stable,address pool,uint256)',
  event_swap: 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)',
  event_gauge_created: 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)',
  event_notify_reward: 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)',
}

const abis = {
  fees: 'function getFee(address pool, bool _stable) external view returns (uint256)'
}

type PoolInfo = {
  pair: string;
  token0: string;
  token1: string;
  stable: number;
  logs: any
};

const getBribes = async (fromBlock: number, toBlock: number, fetchOptions: FetchOptions): Promise<{ dailyBribesRevenue: sdk.Balances }> => {
  const { createBalances, chain } = fetchOptions
  const dailyBribesRevenue = createBalances()
  const logs_gauge_created = await sdk.indexer.getLogs({ chain, target: CONFIG.voter, fromBlock: 3200601, toBlock, topics: [topics.event_gaugeCreated], eventAbi: eventAbis.event_gauge_created })
  const bribes_contract: string[] = logs_gauge_created.map((log) => log[4].toLowerCase())
  const logs = await sdk.indexer.getLogs({ chain, targets: bribes_contract, fromBlock, toBlock, topics:[topics.event_notify_reward], eventAbi: eventAbis.event_notify_reward })
  logs.forEach(([_, reward, amount]) => { dailyBribesRevenue.add(reward, amount) })
  return { dailyBribesRevenue }
}

const getVolumeAndFees = async (fromBlock: number, toBlock: number, fetchOptions: FetchOptions): Promise<{ dailyVolume: sdk.Balances; dailyFees: sdk.Balances }> => {
  // const startTime = Date.now();
  const { createBalances, api, chain } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const rawPools = await sdk.indexer.getLogs({ chain, target: CONFIG.factory, fromBlock: 3200668, toBlock, topics:[topics.event_poolCreated], eventAbi: eventAbis.event_pool_created })
  const pools = rawPools.map(([token0, token1, stable, pair]) => ({ pair, token0, token1, stable: stable === true ? 1 : 0, logs: [] }))

  const { pairs, token0s, token1s } = await filterPools2({
    fetchOptions,
    pairs: pools.map(p => p.pair),
    token0s: pools.map(p => p.token0),
    token1s: pools.map(p => p.token1),
    minUSDValue: 1000,
    maxPairSize: 5000,
  })

  const filteredPools: PoolInfo[] = pairs.map((pair: string, index: number) => {
    const originalPool = pools.find((p: any) => p.pair === pair);
    if (!originalPool) return null;
    return { pair, token0: token0s[index], token1: token1s[index], stable: originalPool.stable, logs: [] };
  }).filter(Boolean);

  const fees = await api.multiCall({ abi: abis.fees, calls: filteredPools.map(({ pair, stable }) => ({ target: CONFIG.factory, params: [pair, stable] })) })
  const poolsAndFees = filteredPools.map((pool, index) => ({ ...pool, fees: fees[index] / 1e4, logs: [] as any[] }));

  const blockStep = 5000;
  const poolChunkSize = 10;
  
  for (let i = 0; i < poolsAndFees.length; i += poolChunkSize) {
    const chunkPools = poolsAndFees.slice(i, i + poolChunkSize);
  
    for (let startBlock = fromBlock; startBlock <= toBlock; startBlock += blockStep) {
      const endBlock = Math.min(startBlock + blockStep - 1, toBlock);
  
      const logsChunk = await sdk.indexer.getLogs({
        chain,
        targets: chunkPools.map(pool => pool.pair),
        fromBlock: startBlock,
        toBlock: endBlock,
        topics: [topics.event_swap],
        eventAbi: eventAbis.event_swap,
        entireLog: true,
        all: true
      });

      for (const pool of chunkPools) {
        const poolLogs = logsChunk.filter((log: any) => {
          const emitter = log.address || log.source;
          return emitter && emitter.toLowerCase() === pool.pair.toLowerCase();
        });
        pool.logs.push(...poolLogs);
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
  // console.table(logsByPool);
  // console.log(`Script execution time: ${runtime} ms`);
  // console.log(`Total number of poolsAndFees: ${totalPools}`);
  // console.log(`Total number of logs: ${totalLogs}`);

  for (const pool of poolsAndFees) {
    const { token0, token1, fees, logs = [] } = pool;
  
    logs.forEach((log: any) => {
      const amount0 = Number(log.args[2]);
      const amount1 = Number(log.args[3]);
      const fee0 = amount0 * fees;
      const fee1 = amount1 * fees;
  
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 });
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 });
    });
  }

  return { dailyVolume, dailyFees }
}

const fetch = async (_t: any, _a: any, options: FetchOptions): Promise<FetchResult> => {
  const { getToBlock, getFromBlock } = options
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

  const [{ dailyVolume, dailyFees }, { dailyBribesRevenue }] = await Promise.all([
    getVolumeAndFees(fromBlock, toBlock, options),
    getBribes(fromBlock, toBlock, options)
  ])

  return { dailyVolume, dailyFees, dailyBribesRevenue }
}

const adapters: SimpleAdapter = {
  version: 1,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-08-28'
    }
  }
}

export default adapters