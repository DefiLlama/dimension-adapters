import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { ethers } from "ethers";
import PromisePool from "@supercharge/promise-pool";
import { handleBribeToken } from "./utils";

const CONFIG = {
  PoolFactory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
  voter: '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5',
  GaugeFactory: '0x35f35ca5b132cadf2916bab57639128eac5bbcb5'
}

const event_topics = {
  swap: '0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b'
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

// One pass over GaugeCreated supplies both: pool->gauge (for staked-LP share) and
// the bribe-contract set (for NotifyReward filtering).  Filtered to the canonical
// non-CL gauge factory.
const getGaugeMetadata = async (
  fetchOptions: FetchOptions,
): Promise<{ poolToGauge: Map<string, string>; bribeSet: Set<string> }> => {
  const logs = await fetchOptions.getLogs({
    target: CONFIG.voter,
    fromBlock: 3200601,
    eventAbi: eventAbis.event_gaugeCreated,
    skipIndexer: true,
    cacheInCloud: true,
  })
  const poolToGauge = new Map<string, string>()
  const bribeSet = new Set<string>()
  const factory = CONFIG.GaugeFactory.toLowerCase()
  for (const log of logs as any[]) {
    if (String(log[2]).toLowerCase() !== factory) continue
    poolToGauge.set(String(log[3]).toLowerCase(), String(log[6]).toLowerCase())
    bribeSet.add(String(log[4]).toLowerCase())
  }
  return { poolToGauge, bribeSet }
}

const getBribes = async (
  fetchOptions: FetchOptions,
  bribeSet: Set<string>,
): Promise<{ dailyBribesRevenue: sdk.Balances }> => {
  const { createBalances, startTimestamp } = fetchOptions
  const iface = new ethers.Interface([eventAbis.event_notify_reward])
  const dailyBribesRevenue = createBalances()
  if (bribeSet.size === 0) return { dailyBribesRevenue }

  // need to manually parse logs, auto parsing fails for some reason
  const logs = await fetchOptions.getLogs({ noTarget: true, eventAbi: eventAbis.event_notify_reward, entireLog: true })
  logs.forEach((log: any) => {
    const contract = (log.address || log.source).toLowerCase()
    if (!bribeSet.has(contract)) return
    const parsedLog = iface.parseLog(log)
    const token = parsedLog!.args.reward.toLowerCase()
    const amount = parsedLog!.args.amount
    handleBribeToken(token, amount, startTimestamp, dailyBribesRevenue)
  })
  return { dailyBribesRevenue }
}

// Strategy A: per-pool staked share = pool.balanceOf(gauge) / pool.totalSupply.
// Non-CL Aerodrome v2 has no unstaked-LP rake module, so all unstaked fees stay
// with LPs.  For each swap fee we split: holders = fee × stakedShare,
// supplySide = fee × (1 - stakedShare).  Pools without a gauge contribute 0 to
// holders.  Snapshot ratio is read at the cron block.
const getVolumeFeesAndRevenue = async (
  fromBlock: number,
  toBlock: number,
  fetchOptions: FetchOptions,
  poolToGauge: Map<string, string>,
) => {
  const { createBalances, api, chain } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  const rawPools = await fetchOptions.getLogs({ target: CONFIG.PoolFactory, fromBlock: 3200668, eventAbi: eventAbis.event_pool_created, onlyArgs: true, cacheInCloud: true, skipIndexer: true })

  const fees = await api.multiCall({
    abi: abis.fees, target: CONFIG.PoolFactory, calls: rawPools.map(i => ({ params: [i.pool, i.stable] }))
  })
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
  const gaugeForPool = rawPools.map((p: any) => poolToGauge.get(String(p.pool).toLowerCase()) ?? ZERO_ADDR)
  const [stakedBalances, totalSupplies] = await Promise.all([
    api.multiCall({
      abi: 'function balanceOf(address) view returns (uint256)',
      calls: rawPools.map((p: any, i: number) => ({ target: p.pool, params: [gaugeForPool[i]] })),
      permitFailure: true,
    }),
    api.multiCall({
      abi: 'erc20:totalSupply',
      calls: rawPools.map((p: any) => p.pool),
      permitFailure: true,
    }),
  ])

  const poolInfoMap = {} as any
  const aeroPoolSet = new Set<string>()
  rawPools.forEach(({ token0, token1, stable, pool }: any, index: number) => {
    pool = String(pool).toLowerCase()
    const fee = Number(fees[index]) / 1e4
    const hasGauge = poolToGauge.has(pool)
    const totalSupply = Number(totalSupplies[index] ?? 0)
    const stakedSupply = Number(stakedBalances[index] ?? 0)
    let stakedShare = 0
    if (hasGauge && totalSupply > 0) {
      stakedShare = Math.min(1, stakedSupply / totalSupply)
    }
    poolInfoMap[pool] = { token0, token1, stable, fee, stakedShare }
    aeroPoolSet.add(pool)
  })


  const blockStep = 2000;
  let i = 0;
  let startBlock = fromBlock;
  let ranges: any = []



  while (startBlock < toBlock) {
    const endBlock = Math.min(startBlock + blockStep - 1, toBlock)
    ranges.push([startBlock, endBlock])
    startBlock += blockStep
  }

  let errorFound: any = false

  await PromisePool
    .withConcurrency(5)
    .for(ranges)
    .process(async ([startBlock, endBlock]: any) => {
      if (errorFound) return;
      try {
        const logs = await fetchOptions.getLogs({
          noTarget: true,
          fromBlock: startBlock,
          toBlock: endBlock,
          eventAbi: eventAbis.event_swap,
          topics: [event_topics.swap],
          entireLog: true,
          skipCache: true,
        })
        sdk.log(`Aerodrome got logs (${logs.length}) for ${i++}/ ${Math.ceil((toBlock - fromBlock) / blockStep)}`)
        const iface = new ethers.Interface([eventAbis.event_swap]);

        logs.forEach((log: any) => {
          const pool = (log.address || log.source).toLowerCase()
          if (!aeroPoolSet.has(pool)) return;
          const parsedLog = iface.parseLog(log)
          const { token0, token1, fee, stakedShare } = poolInfoMap[pool]
          const amount0 = Number(parsedLog!.args.amount0In) + Number(parsedLog!.args.amount0Out)
          const amount1 = Number(parsedLog!.args.amount1In) + Number(parsedLog!.args.amount1Out)
          const fee0 = amount0 * fee
          const fee1 = amount1 * fee
          addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
          addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 })
          if (stakedShare > 0) {
            addOneToken({ chain, balances: dailyHoldersRevenue, token0, token1, amount0: fee0 * stakedShare, amount1: fee1 * stakedShare })
          }
          if (stakedShare < 1) {
            const supplyShare = 1 - stakedShare
            addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: fee0 * supplyShare, amount1: fee1 * supplyShare })
          }
        })
      } catch (e) {
        errorFound = e
        throw e
      }
    })

  if (errorFound) throw errorFound

  return { dailyVolume, dailyFees, dailyHoldersRevenue, dailySupplySideRevenue }
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { getToBlock, getFromBlock } = options
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])
  const { poolToGauge, bribeSet } = await getGaugeMetadata(options)
  const [{ dailyVolume, dailyFees, dailyHoldersRevenue, dailySupplySideRevenue }, { dailyBribesRevenue }] = await Promise.all([
    getVolumeFeesAndRevenue(fromBlock, toBlock, options, poolToGauge),
    getBribes(options, bribeSet),
  ])
  return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyVolume,
    dailyBribesRevenue,
  }
}

const methodology = {
  Fees: "Total swap fees paid by traders. Per-pool fee rate read from PoolFactory.getFee (default sAMM 0.05%, vAMM 0.30%; customizable per pool) applied to each swap's input amount.",
  Revenue: "veAERO holders' share of swap fees, equal to HoldersRevenue (Aerodrome's zero-leak model routes all protocol revenue to voters).",
  HoldersRevenue: "Fees earned by LPs staked in the gauge — forwarded to FeeVotingReward for distribution to veAERO voters. Computed per pool as fees × pool.balanceOf(gauge) / pool.totalSupply.",
  SupplySideRevenue: "Unstaked LPs' pro-rata share of swap fees, claimable directly from the pool. Computed per pool as fees × (1 − stakedShare). Aerodrome v2 has no unstaked-LP rake module, so unstaked LPs keep 100% of their share.",
  BribesRevenue: "External bribes deposited to BribeVotingReward contracts (NotifyReward events filtered to the v2 GaugeFactory). Pre-launch tokens are priced via hardcoded conversion rates until each token's cutoff timestamp; afterwards DefiLlama spot pricing is used.",
}

const breakdownMethodology = {
  Fees: {
    'Swap fees': 'All swap fees paid by traders on Aerodrome v2 pools.',
  },
  Revenue: {
    'Holders fees': 'Staked-LP share of swap fees, forwarded to veAERO voters via FeeVotingReward.',
  },
  HoldersRevenue: {
    'Holders fees': 'Staked-LP share of swap fees, forwarded to veAERO voters via FeeVotingReward.',
  },
  SupplySideRevenue: {
    'LP fees': 'Unstaked-LP pro-rata share of swap fees, claimable directly from the pool.',
  },
  BribesRevenue: {
    'External bribes': "Token deposits to a pool's BribeVotingReward contract that veAERO voters claim by voting for the pool's gauge.",
  },
}

const adapters: SimpleAdapter = {
  version: 2,
  // pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: '2023-08-28',
  methodology,
  breakdownMethodology,
}

export default adapters
