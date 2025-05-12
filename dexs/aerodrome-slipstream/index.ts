import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { ethers } from "ethers";

const CONFIG = {
  factory: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A',
  voter: '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5',
  GaugeFactory: '0xd30677bd8dd15132f251cb54cbda552d2a05fb08'
}

const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  event_gaugeCreated: 'event GaugeCreated(address indexed poolFactory, address indexed votingRewardsFactory, address indexed gaugeFactory, address pool, address bribeVotingReward, address feeVotingReward, address gauge, address creator)',
  event_claim_rewards: 'event ClaimRewards(address indexed from, address indexed reward, uint256 amount)'
}

const abis = {
  fee: 'uint256:fee'
}

const getBribes = async (fetchOptions: FetchOptions): Promise<{ dailyBribesRevenue: sdk.Balances }> => {
  const { createBalances, getLogs } = fetchOptions
  const iface = new ethers.Interface([eventAbis.event_claim_rewards]);

  const dailyBribesRevenue = createBalances()
  const logs_gauge_created = await getLogs({ target: CONFIG.voter, fromBlock: 13843704, eventAbi: eventAbis.event_gaugeCreated, skipIndexer: true, })
  if (!logs_gauge_created?.length) return { dailyBribesRevenue };

  const bribes_contract: string[] = logs_gauge_created
    .filter((log) => log[2].toLowerCase() === CONFIG.GaugeFactory.toLowerCase())
    .map((log) => log[4].toLowerCase())
  const bribeSet = new Set(bribes_contract)

  const logs = await getLogs({ noTarget: true, eventAbi: eventAbis.event_claim_rewards, entireLog: true, })
  logs.forEach((log: any) => {
    const contract = (log.address || log.source).toLowerCase()
    if (!bribeSet.has(contract)) return;
    const parsedLog = iface.parseLog(log)
    dailyBribesRevenue.add(parsedLog!.args.reward, parsedLog!.args.amount)
  })
  return { dailyBribesRevenue }
}

const fetch = async (_: any, _1: any, fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, getToBlock, getFromBlock, chain, getLogs } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

  const rawPools = await getLogs({ target: CONFIG.factory, fromBlock: 13843704, toBlock, eventAbi: eventAbis.event_poolCreated, skipIndexer: true, })
  const _pools = rawPools.map((i: any) => i.pool.toLowerCase())
  const fees = await api.multiCall({ abi: abis.fee, calls: _pools })
  const aeroPoolSet = new Set()
  const poolInfoMap = {} as any
  rawPools.forEach(({ token0, token1, pool }, index) => {
    pool = pool.toLowerCase()
    const fee = fees[index] / 1e6
    poolInfoMap[pool] = { token0, token1, fee }
    aeroPoolSet.add(pool)
  })

  const blockStep = 500;
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
    sdk.log(`Aerodrome slipstream got logs (${logs.length}) for ${i++}/ ${Math.ceil((toBlock - fromBlock) / blockStep)}`)
    logs.forEach((log: any) => {
      const pool = (log.address || log.source).toLowerCase()
      if (!aeroPoolSet.has(pool)) return;
      const { token0, token1, fee } = poolInfoMap[pool]
      const amount0 = Number(log.args.amount0)
      const amount1 = Number(log.args.amount1)
      const fee0 = amount0 * fee
      const fee1 = amount1 * fee
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 })
    })

    startBlock += blockStep
  }

  const { dailyBribesRevenue } = await getBribes(fetchOptions)

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees, dailyBribesRevenue }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2024-05-03',
    }
  }
}
export default adapters;
