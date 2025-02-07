import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { addOneToken } from "../../helpers/prices";
import { filterPools2 } from "../../helpers/uniswap";

interface ILog {
  address: string;
  data: string;
  transactionHash: string;
  topics: string[];
}
const event_swap = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'
const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';
const event_gauge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'


const fetchBribes = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { getLogs, createBalances } = fetchOptions
  const voter = '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5';
  const dailyBribes = createBalances()
  const logs_gauge_created = (await getLogs({
    target: voter,
    fromBlock: 3200601,
    eventAbi: event_gauge_created,
    cacheInCloud: true,
  }))
  const bribes_contract: string[] = logs_gauge_created.map((e: any) => e.bribeVotingReward.toLowerCase());

  const logs = await getLogs({
    targets: bribes_contract,
    eventAbi: event_notify_reward,
  })
  logs.map((e: any) => {
    dailyBribes.add(e.reward, e.amount)
  })

  return { dailyBribesRevenue: dailyBribes } as any
}

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, getLogs, createBalances, } = fetchOptions
  const chain = api.chain
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  let pairs = await api.fetchList({ lengthAbi: 'allPoolsLength', itemAbi: 'allPools', target: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da' })
  let token0s = await api.multiCall({ abi: 'address:token0', calls: pairs })
  let token1s = await api.multiCall({ abi: 'address:token1', calls: pairs })

  const res = await filterPools2({ fetchOptions, pairs, token0s, token1s, minUSDValue: 10000, maxPairSize: 1200 })
  pairs = res.pairs
  token0s = res.token0s
  token1s = res.token1s

  let stables = await api.multiCall({ abi: 'bool:stable', calls: pairs })

  const poolsCalls: any[] = [];
  pairs.forEach((pair: any, i) => {
    poolsCalls.push({
      target: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
      params: [pair, stables[i]]
    })
  });

  const fees = await api.multiCall({ abi: 'function getFee(address pool, bool _stable) external view returns (uint256)', calls: poolsCalls })

  let logs: ILog[][] = [];
  const targetChunkSize = 5;
  let currentTargetOffset = 0;
  let unfinished = true;

  while (unfinished) {
    let endOffset = currentTargetOffset + targetChunkSize;
    if (endOffset >= pairs.length) {
      unfinished = false;
      endOffset = pairs.length;
    }

    let currentLogs: ILog[][] = await getLogs({
      targets: pairs.slice(currentTargetOffset, endOffset),
      eventAbi: event_swap,
      flatten: false,
    })

    logs.push(...currentLogs);
    currentTargetOffset += targetChunkSize;
  }

  logs.forEach((logs: ILog[], idx: number) => {
    const token0 = token0s[idx]
    const token1 = token1s[idx]
    const fee = fees[idx]/1e4

    logs.forEach((log: any) => {
      let amount0 = log.amount0In;
      let amount1 = log.amount1Out;

      if (Number(amount0) === 0) {
        amount0 = log.amount0out;
        amount1 = log.amount1In;
      }

      let fee0 = Number(amount0) * fee;
      let fee1 = Number(amount1) * fee;
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 })
    })
  })

  const bribes = await fetchBribes(fetchOptions)
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees, ...bribes } as any
}

const adapters: SimpleAdapter = {
  version: 2,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2023-08-28',
    }
  }
}
export default adapters;
