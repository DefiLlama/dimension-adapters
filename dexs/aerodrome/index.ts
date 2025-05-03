import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { ethers } from "ethers";

const CONFIG = {
  PoolFactory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
  voter: '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5',
  GaugeFactory: '0x35f35ca5b132cadf2916bab57639128eac5bbcb5'
}

const eventAbis = {
  event_pool_created: 'event PoolCreated(address indexed token0,address indexed token1,bool indexed stable,address pool,uint256)',
  event_swap: 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)',
  event_gaugeCreated: 'event GaugeCreated(address indexed poolFactory, address indexed votingRewardsFactory, address indexed gaugeFactory, address pool, address bribeVotingReward, address feeVotingReward, address gauge, address creator)',
  event_notify_reward: 'event NotifyReward(address indexed from, address indexed reward, uint256 indexed epoch, uint256 amount)',
  event_claim_rewards: 'event ClaimRewards(address indexed from, address indexed reward, uint256 amount)'
}

const abis = {
  fees: 'function getFee(address pool, bool _stable) external view returns (uint256)'
}

const getBribes = async (fetchOptions: FetchOptions): Promise<{ dailyBribesRevenue: sdk.Balances }> => {
  const { createBalances, } = fetchOptions
  const iface = new ethers.Interface([eventAbis.event_claim_rewards]);

  const dailyBribesRevenue = createBalances()
  const logs_gauge_created = await fetchOptions.getLogs({ target: CONFIG.voter, fromBlock: 3200601, eventAbi: eventAbis.event_gaugeCreated, skipIndexer: true, })
  if (!logs_gauge_created?.length) return { dailyBribesRevenue };

  const bribes_contract: string[] = logs_gauge_created
    .filter((log) => log[2].toLowerCase() === CONFIG.GaugeFactory.toLowerCase())
    .map((log) => log[4].toLowerCase())
  const bribeSet = new Set(bribes_contract)
  // need to manually parse logs, auto parsing fails for some reason
  const logs = await fetchOptions.getLogs({ noTarget: true, eventAbi: eventAbis.event_claim_rewards, entireLog: true,  })
  logs.forEach((log: any) => {
    const contract = (log.address || log.source).toLowerCase()
    if (!bribeSet.has(contract)) return;
    const parsedLog = iface.parseLog(log)
    dailyBribesRevenue.add(parsedLog!.args.reward, parsedLog!.args.amount)
  })
  return { dailyBribesRevenue }
}

const getVolumeAndFees = async (fromBlock: number, toBlock: number, fetchOptions: FetchOptions) => {
  const { createBalances, api, chain } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const rawPools = await fetchOptions.getLogs({ target: CONFIG.PoolFactory, fromBlock: 3200668, eventAbi: eventAbis.event_pool_created, onlyArgs: true, cacheInCloud: true, skipIndexer: true, })

  const fees = await api.multiCall({
    abi: abis.fees, target: CONFIG.PoolFactory, calls: rawPools.map(i => ({ params: [i.pool, i.stable] }))
  })
  const poolInfoMap = {} as any
  const aeroPoolSet = new Set()
  rawPools.forEach(({ token0, token1, stable, pool }, index) => {
    pool = pool.toLowerCase()
    const fee = fees[index] / 1e4
    poolInfoMap[pool] = { token0, token1, stable, fee }
    aeroPoolSet.add(pool)
  })


  const blockStep = 1000;
  let i = 0;
  let startBlock = fromBlock;

  while (startBlock < toBlock) {
    const endBlock = Math.min(startBlock + blockStep - 1, toBlock)
    const logs = await fetchOptions.getLogs({
      noTarget: true,
      fromBlock: startBlock,
      toBlock: endBlock,
      eventAbi: eventAbis.event_swap,
      entireLog: true,
    })
    sdk.log(`Aerodrome got logs (${logs.length}) for ${i++}/ ${Math.ceil((toBlock - fromBlock) / blockStep)}`)
    logs.forEach((log: any) => {
      const pool = (log.address || log.source).toLowerCase()
      if (!aeroPoolSet.has(pool)) return;
      const { token0, token1, fee } = poolInfoMap[pool]
      const amount0 = Number(log.args.amount0In) + Number(log.args.amount0Out)
      const amount1 = Number(log.args.amount1In) + Number(log.args.amount1Out)
      const fee0 = amount0 * fee
      const fee1 = amount1 * fee
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 })
    })
    startBlock += blockStep
  }

  return { dailyVolume, dailyFees }
}

const fetch = async (_t: any, _a: any, options: FetchOptions): Promise<FetchResult> => {
  const { getToBlock, getFromBlock } = options
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])
  const { dailyBribesRevenue } = await getBribes(options)
  const { dailyVolume, dailyFees } = await getVolumeAndFees(fromBlock, toBlock, options)
  return { dailyFees, dailyVolume, dailyBribesRevenue }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-08-28'
    }
  }
}

export default adapters