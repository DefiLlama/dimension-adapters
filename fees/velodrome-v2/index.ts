import ADDRESSES from '../../helpers/coreAssets.json'
import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const ABI = {
  swap: 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)',
  notifyReward: 'event NotifyReward(address indexed from,uint256 amount)',
  notifyRewardWithToken: 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)',
  gaugeCreated: 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)',
  leafGaugeCreated: 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address incentiveVotingReward,address feeVotingReward,address gauge)',
  gauges: 'function gauges(address) view returns (address)',
}

const leaf_voter = '0x97cDBCe21B6fd0585d29E539B1B99dAd328a1123'
const leaf_pool_factory = '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0'

type ChainConfig = {
  start?: string
  factory?: string
  voter?: string
  maxPairSize?: number
  bribeFromBlock?: number
  stakingRewards?: string
  rewardToken?: string
  leafFromBlock?: number
}
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.OPTIMISM]: {
    factory: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a',
    voter: '0x41c914ee0c7e1a5edcd0295623e6dc557b5abf3c',
    maxPairSize: 500,
    bribeFromBlock: 105896852,
  },
  [CHAIN.MODE]: {
    stakingRewards: '0xD2F998a46e4d9Dd57aF1a28EBa8C34E7dD3851D7',
    rewardToken: '0xDfc7C877a950e49D2610114102175A06C2e3167a',
    leafFromBlock: 15405187,
  },
  [CHAIN.BOB]: {
    stakingRewards: "0x8Eb6838B4e998DA08aab851F3d42076f21530389",
    rewardToken: ADDRESSES.optimism.WETH_1,
  },
  [CHAIN.LISK]: { leafFromBlock: 8339180 },
  [CHAIN.FRAXTAL]: { leafFromBlock: 12603117 },
  [CHAIN.INK]: { leafFromBlock: 3448692 },
  [CHAIN.SONEIUM]: { leafFromBlock: 1906595 },
  [CHAIN.UNICHAIN]: { leafFromBlock: 9387000 },
  [CHAIN.SWELLCHAIN]: { voter: leaf_voter },
}
const customLogic = async ({ dailyFees, fetchOptions, filteredPairs, }: any, config: ChainConfig) => {
  const { createBalances, getLogs, api, getToBlock, } = fetchOptions
  const dailyBribes = createBalances()

  if (config.bribeFromBlock && config.voter) {
    const gaugeCreatedLogs = await getLogs({
      target: config.voter,
      fromBlock: config.bribeFromBlock,
      toBlock: await getToBlock(),
      eventAbi: ABI.gaugeCreated,
      cacheInCloud: true,
    })
    const targets = gaugeCreatedLogs.map((log: any) => log.bribeVotingReward.toLowerCase());
    const logs = await getLogs({ targets, eventAbi: ABI.notifyRewardWithToken })
    logs.forEach((log: any) => dailyBribes.add(log.reward, log.amount, 'Voting Incentives'))
  }

  if (config.stakingRewards && config.rewardToken) {
    const pairs = Object.keys(filteredPairs)
    const gauges = await api.multiCall({ target: config.stakingRewards, abi: ABI.gauges, calls: pairs })
    const logs = await getLogs({ targets: gauges, eventAbi: ABI.notifyReward });
    logs.forEach((log: any) => dailyBribes.add(config.rewardToken!, log.amount, 'Voting Incentives'))
  }

  if (config.leafFromBlock) {
    const leafGaugeLogs = await getLogs({
      target: leaf_voter,
      fromBlock: config.leafFromBlock,
      toBlock: await getToBlock(),
      eventAbi: ABI.leafGaugeCreated,
      cacheInCloud: true,
    })
    const targets = leafGaugeLogs.map((log: any) => log.incentiveVotingReward.toLowerCase());
    const logs = await getLogs({ targets, eventAbi: ABI.notifyRewardWithToken })
    logs.forEach((log: any) => dailyBribes.add(log.reward, log.amount, 'Voting Incentives'))
  }

  dailyFees = dailyFees.clone(1, METRIC.SWAP_FEES)

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(1, METRIC.SWAP_FEES),
    dailyRevenue: dailyFees.clone(1, 'Swap Fees To Voters'),
    dailyHoldersRevenue: dailyFees.clone(1, 'Swap Fees To Voters'),
    dailyBribesRevenue: dailyBribes,
  } as any
}

const methodology = {
  Fees: "Swap fees paid by users on Velodrome V2 trades.",
  UserFees: "Users pay swap fees on each Velodrome V2 trade.",
  Revenue: "Swap fees are distributed to veVELO voters.",
  HoldersRevenue: "Swap fees are distributed to veVELO voters.",
  SupplySideRevenue: "LPs receive VELO gauge emissions, not swap fees.",
  BribesRevenue: "External voting incentives paid to veVELO voters.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by users on Velodrome V2 trades.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by users on Velodrome V2 trades.",
  },
  Revenue: {
    'Swap Fees To Voters': "Swap fees distributed to veVELO voters.",
  },
  HoldersRevenue: {
    'Swap Fees To Voters': "Swap fees distributed to veVELO voters.",
  },
  BribesRevenue: {
    'Voting Incentives': "External incentives paid to veVELO voters for directing liquidity emissions.",
  },
}

const fetch = async (options: any) => {
  const config = chainConfig[options.chain]
  const adapterFetch = getUniV2LogAdapter({
    factory: config.factory ?? leaf_pool_factory,
    swapEvent: ABI.swap,
    voter: config.voter,
    maxPairSize: config.maxPairSize,
    customLogic: (props: any) => customLogic(props, config),
  })

  return adapterFetch(options)
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: chainConfig,
}

export default adapter
