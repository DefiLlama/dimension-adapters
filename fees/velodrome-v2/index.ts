import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap";

const swapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'
const notifyRewardEvent = 'event NotifyReward(address indexed from,uint256 amount)';

const event_notify_reward_op = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';
const event_gauge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'
const leaf_gauge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address incentiveVotingReward,address feeVotingReward,address gauge)'
const leaf_voter = '0x97cDBCe21B6fd0585d29E539B1B99dAd328a1123'
const leaf_pool_factory = '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0'

const config: Record<string, any> = {
  [CHAIN.MODE]: {
    stakingRewards: '0xD2F998a46e4d9Dd57aF1a28EBa8C34E7dD3851D7',
    rewardToken: '0xDfc7C877a950e49D2610114102175A06C2e3167a',
  },
  [CHAIN.BOB]: {
    stakingRewards: "0x8Eb6838B4e998DA08aab851F3d42076f21530389",
    rewardToken: ADDRESSES.optimism.WETH_1,
  }
}

const superchainConfig: Record<string, any> = {
  [CHAIN.MODE]: {
    start_block: 15405187,
  },
  [CHAIN.LISK]: {
    start_block: 8339180,
  },
  [CHAIN.INK]: {
    start_block: 3448692,
  },
  [CHAIN.SONEIUM]: {
    start_block: 1906595,
  },
  [CHAIN.FRAXTAL]: {
    start_block: 12603117,
  },
  [CHAIN.UNICHAIN]: {
    start_block: 9387000,
  }
}


const customLogic = async ({ dailyFees, fetchOptions, filteredPairs, }: any) => {
  const { createBalances, getLogs, chain, api, getToBlock, } = fetchOptions
  const dailyBribes = createBalances()

  // handle native OP Mainnet bribes
  if (chain === CHAIN.OPTIMISM) {
    let voter = '0x41C914ee0c7E1A5edCD0295623e6dC557B5aBf3C'
    const logs_gauge_created = (await getLogs({
      target: voter,
      fromBlock: 105896852,
      toBlock: await getToBlock(),
      eventAbi: event_gauge_created,
      cacheInCloud: true,
    }))
    const bribes_contract: string[] = logs_gauge_created.map((e: any) => e.bribeVotingReward.toLowerCase());

    let logs = await getLogs({
      targets: bribes_contract,
      eventAbi: event_notify_reward_op,
    })
    logs.map((e: any) => {
      dailyBribes.add(e.reward, e.amount)
    })
  }
  // handle Superchain beta "staking rewards" bribes on Mode and Bob
  if (chain in config) {
    const { stakingRewards, rewardToken, } = config[chain]
    const pairs = Object.keys(filteredPairs)
    const gauges = await api.multiCall({ target: stakingRewards, abi: 'function gauges(address) view returns (address)', calls: pairs })
    let logs = await getLogs({ targets: gauges, eventAbi: notifyRewardEvent })

    logs.forEach((log: any) => {
      dailyBribes.add(rewardToken, log.amount)
    })
  }

  // handle Superchain 1.0 L2 bribes
  if (chain in superchainConfig) {
    const leaf_gauge_logs = (await getLogs({
      target: leaf_voter,
      fromBlock: superchainConfig[chain]['start_block'],
      toBlock: await getToBlock(),
      eventAbi: leaf_gauge_created,
      cacheInCloud: true,
    }))
    const incentive_contracts: string[] = leaf_gauge_logs.map((e: any) => e.incentiveVotingReward.toLowerCase());

    let logs = await getLogs({
      targets: incentive_contracts,
      eventAbi: event_notify_reward_op,
    })
    logs.map((e: any) => {
      dailyBribes.add(e.reward, e.amount)
    })
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees, dailyBribesRevenue: dailyBribes } as any
}

export default uniV2Exports({
  [CHAIN.OPTIMISM]: { factory: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a', swapEvent, voter: '0x41c914ee0c7e1a5edcd0295623e6dc557b5abf3c', maxPairSize: 500, customLogic, },
  [CHAIN.MODE]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', customLogic },
  [CHAIN.BOB]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, customLogic, },
  [CHAIN.LISK]: {factory: leaf_pool_factory, customLogic},
  [CHAIN.FRAXTAL]: {factory: leaf_pool_factory, customLogic},
  [CHAIN.INK]: {factory: leaf_pool_factory, customLogic},
  [CHAIN.SONEIUM]: {factory: leaf_pool_factory, customLogic},
  [CHAIN.UNICHAIN]: {factory: leaf_pool_factory, customLogic},
  [CHAIN.SWELLCHAIN]: {factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, voter: '0x97cDBCe21B6fd0585d29E539B1B99dAd328a1123', customLogic,}
})
