import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addOneToken } from '../../helpers/prices';

const CONFIG = {
  PoolFactory: '0x65E6cD0eF5D3467030103cf3d433034E570b5784',
  voter: '0x2F80F810a114223AC69E34E84E735CaD515dAD67',
  GaugeFactory: '0xFc080D1EcD7c332022cebf942AEb62d5E1d4Cb08'
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

const fetch = async (options: FetchOptions) => {
  const { createBalances, api, chain, getLogs } = options

  const dailyVolume = createBalances()
  const dailyFeesProxy = createBalances()

  const rawPools = await getLogs({ target: CONFIG.PoolFactory, fromBlock: 98741567, eventAbi: eventAbis.event_pool_created, cacheInCloud: true, })

  const fees = await api.multiCall({
    abi: abis.fees, target: CONFIG.PoolFactory, calls: rawPools.map(i => ({ params: [i.pool, i.stable] }))
  })
  const poolInfoMap = {}
  const aeroPoolSet = new Set()
  rawPools.forEach(({ token0, token1, stable, pool }, index) => {
    pool = pool.toLowerCase()
    const fee = fees[index] / 1e4
    poolInfoMap[pool] = { token0, token1, stable, fee }
    aeroPoolSet.add(pool)
  })

  const swapLogs = await getLogs({
    targets: rawPools.map(i => i.pool),
    eventAbi: eventAbis.event_swap,
    entireLog: true,
    parseLog: true,
  })

  swapLogs.forEach((log: any) => {
    const pool = log.address.toLowerCase()
    if (!aeroPoolSet.has(pool)) return;
    const { token0, token1, fee } = poolInfoMap[pool]
    const amount0 = Number(log.args.amount0In) + Number(log.args.amount0Out)
    const amount1 = Number(log.args.amount1In) + Number(log.args.amount1Out)
    const fee0 = amount0 * fee
    const fee1 = amount1 * fee
    addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
    addOneToken({ chain, balances: dailyFeesProxy, token0, token1, amount0: fee0, amount1: fee1 })
  })

  const dailyFees = dailyFeesProxy.clone(1, METRIC.SWAP_FEES);
  const dailyHoldersRevenue = dailyFeesProxy.clone(1, 'Swap Fees To veTOPAZ voters');

  const gaugeCreatedLogs = await getLogs({ target: CONFIG.voter, fromBlock: 98741567, eventAbi: eventAbis.event_gaugeCreated, cacheInCloud: true, })
  if (gaugeCreatedLogs.length) {
    const bribes_contract: string[] = gaugeCreatedLogs
      .filter((log) => log.gaugeFactory.toLowerCase() === CONFIG.GaugeFactory.toLowerCase())
      .map((log) => log.bribeVotingReward.toLowerCase())
    const bribeSet = new Set(bribes_contract)

    const bribeLogs = await getLogs({ targets: Array.from(bribeSet), eventAbi: eventAbis.event_notify_reward })
    bribeLogs.forEach((log: any) => {
      dailyFees.add(log.reward, log.amount, "Bribes")
      dailyHoldersRevenue.add(log.reward, log.amount, "Bribes To veTOPAZ voters")
    })
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: 0
  }
}

const methodology = {
  Volume: "Daily volume is tracked by summing the amountIn of all Swap events across all Topez pools.",
  Fees: "Includes swap fees and bribes",
  Revenue: "Includes swap fees and bribes going to holders",
  HoldersRevenue: "Entire swap fees and bribes go to holders",
  SupplySideRevenue: "Liquidity providers dont get fee share, they are compensated with $TOPAZ emissions",
  ProtocolRevenue: "Protocol makes no revenue from fees",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees collected from users",
    'Bribes': "Bribes collected from users",
  },
  Revenue: {
    'Swap Fees To veTOPAZ voters': "100% of swap fees go to veTOPAZ voters",
    'Bribes To veTOPAZ voters': "100% of bribes go to veTOPAZ voters",
  },
  HoldersRevenue: {
    [METRIC.SWAP_FEES]: "100% of swap fees go to veTOPAZ voters",
    'Bribes To veTOPAZ voters': "100% of bribes go to veTOPAZ voters",
  },
}

const adapters: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: '2026-05-16',
  pullHourly: true,
  methodology,
  breakdownMethodology,
}

export default adapters
