import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from '../../helpers/prices';
import { ethers } from "ethers";
import { handleBribeToken } from "./utils";

const CONFIG = {
  PoolFactory: '0xF6cDfFf7Ad51caaD860e7A35d6D4075d74039a6B',
  voter: '0xC0F53703e9f4b79fA2FB09a2aeBA487FA97729c9',
  GaugeFactory: '0x29BfEd845b1C10e427766b21d4533800B6f4e111'
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

// One pass over GaugeCreated gives both pool->gauge (for the staked-LP share) and the
// bribe-contract set (for NotifyReward filtering), filtered to the non-CL GaugeFactory.
const getGaugeMetadata = async (
  fetchOptions: FetchOptions,
): Promise<{ poolToGauge: Map<string, string>; bribeSet: Set<string> }> => {
  const logs = await fetchOptions.getLogs({ target: CONFIG.voter, fromBlock: 20524597, eventAbi: eventAbis.event_gaugeCreated, skipIndexer: true, cacheInCloud: true, })
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

const getBribes = async (fetchOptions: FetchOptions, bribeSet: Set<string>): Promise<{ dailyBribesRevenue: sdk.Balances }> => {
  const { createBalances, startTimestamp } = fetchOptions
  const iface = new ethers.Interface([eventAbis.event_notify_reward]);
  const dailyBribesRevenue = createBalances()
  if (bribeSet.size === 0) return { dailyBribesRevenue };

  // need to manually parse logs, auto parsing fails for some reason
  const logs = await fetchOptions.getLogs({ noTarget: true, eventAbi: eventAbis.event_notify_reward, entireLog: true, })
  logs.forEach((log: any) => {
    const contract = (log.address || log.source).toLowerCase()
    if (!bribeSet.has(contract)) return;
    const parsedLog = iface.parseLog(log)
    handleBribeToken(parsedLog!.args.reward.toLowerCase(), parsedLog!.args.amount, startTimestamp, dailyBribesRevenue)
  })

  return { dailyBribesRevenue }
}

// Per-pool staked share = pool.balanceOf(gauge) / pool.totalSupply. Aborean v2 (like Aerodrome
// v2) has no unstaked-LP rake, so unstaked fees stay with LPs. Each swap fee splits:
// holders = fee × stakedShare (to veABX voters), supplySide = fee × (1 - stakedShare).
// Pools without a gauge contribute 0 to holders. Ratio is snapshotted at the cron block.
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

  const rawPools = await fetchOptions.getLogs({ target: CONFIG.PoolFactory, fromBlock: 20524597, eventAbi: eventAbis.event_pool_created, onlyArgs: true, cacheInCloud: true, skipIndexer: true, })

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
  // A failed totalSupply/balanceOf read defaults to 0 -> stakedShare 0 -> that pool's fees fall
  // entirely to supplySide. Log the count so this can't silently bias the split.
  const failedSupply = (totalSupplies as any[]).filter((r) => r == null).length
  const failedStaked = (stakedBalances as any[]).filter((r) => r == null).length
  if (failedSupply || failedStaked) sdk.log(`aborean: staked-share reads null — totalSupply ${failedSupply}, gaugeBalance ${failedStaked} of ${rawPools.length} pools`)

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

  const iface = new ethers.Interface([eventAbis.event_swap]);
  const logs = await fetchOptions.getLogs({
    noTarget: true,
    fromBlock,
    toBlock,
    eventAbi: eventAbis.event_swap,
    topics: [event_topics.swap],
    entireLog: true,
  })

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

  const totalFees = options.createBalances()
  const totalHoldersRevenue = options.createBalances()
  const totalSupplySideRevenue = options.createBalances()

  totalFees.add(dailyFees, 'Token Swap Fees')
  totalFees.add(dailyBribesRevenue, 'External Bribes')
  totalHoldersRevenue.add(dailyHoldersRevenue, 'Swap Fees To Voters')
  totalHoldersRevenue.add(dailyBribesRevenue, 'External Bribes To Voters')
  totalSupplySideRevenue.add(dailySupplySideRevenue, 'Swap Fees To LPs')

  return {
    dailyVolume,
    dailyFees: totalFees,
    dailyUserFees: totalFees,
    dailyRevenue: totalHoldersRevenue,
    dailyHoldersRevenue: totalHoldersRevenue,
    dailySupplySideRevenue: totalSupplySideRevenue,
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ABSTRACT],
  start: '2025-10-02',
  methodology: {
    Fees: "All swap fees paid by traders — each pool's fee rate (read on-chain per pool) applied to the amount swapped — plus external bribes deposited for veABX voters.",
    UserFees: "All swap fees paid by traders — each pool's fee rate (read on-chain per pool) applied to the amount swapped — plus external bribes deposited for veABX voters.",
    Revenue: "The swap fees that go to veABX voters plus external bribes. Liquidity providers' share of swap fees is excluded, as it is a cost to the protocol rather than revenue.",
    HoldersRevenue: "The share of swap fees earned by liquidity staked in a pool's gauge — forwarded to veABX voters — plus external bribes. Computed per pool as fees times the staked share of LP tokens.",
    SupplySideRevenue: "Swap fees kept by liquidity providers who have not staked their LP in a gauge. Computed per pool as fees times the unstaked share; pools without a gauge pay 100% of their fees to LPs.",
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees paid by traders on Aborean pools.',
      'External Bribes': 'External bribes deposited for veABX voters.',
    },
    UserFees: {
      'Token Swap Fees': 'Swap fees paid by traders on Aborean pools.',
      'External Bribes': 'External bribes deposited for veABX voters.',
    },
    Revenue: {
      'Swap Fees To Voters': 'Staked-LP share of swap fees, forwarded to veABX voters.',
      'External Bribes To Voters': 'External bribes distributed to veABX voters.',
    },
    HoldersRevenue: {
      'Swap Fees To Voters': 'Staked-LP share of swap fees, forwarded to veABX voters.',
      'External Bribes To Voters': 'External bribes distributed to veABX voters.',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': 'Unstaked-LP share of swap fees, plus all fees from pools without a gauge.',
    },
  }
}

export default adapters
