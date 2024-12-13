import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap";

const swapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'
const notifyRewardEvent = 'event NotifyReward(address indexed from,uint256 amount)';

const event_notify_reward_op = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';
const event_gauge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'

const config = {
  [CHAIN.MODE]: {
    stakingRewards: '0xD2F998a46e4d9Dd57aF1a28EBa8C34E7dD3851D7',
    rewardToken: '0xDfc7C877a950e49D2610114102175A06C2e3167a',
  },
  [CHAIN.BOB]: {
    stakingRewards: "0x8Eb6838B4e998DA08aab851F3d42076f21530389",
    rewardToken: "0x4200000000000000000000000000000000000006",
  }
}


const customLogic = async ({ dailyFees, fetchOptions, filteredPairs, }: any) => {
  const { createBalances, getLogs, chain, api, getToBlock, } = fetchOptions

  if (chain === CHAIN.OPTIMISM) {
    let voter = '0x41C914ee0c7E1A5edCD0295623e6dC557B5aBf3C'
    const dailyBribes = createBalances()
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

    return { dailyBribesRevenue: dailyBribes } as any
  }
  else {
    const { stakingRewards, rewardToken, } = config[chain]
    const pairs = Object.keys(filteredPairs)
    const gauges = await api.multiCall({ target: stakingRewards, abi: 'function gauges(address) view returns (address)', calls: pairs })
    const dailyBribesRevenue = createBalances()
    let logs = await getLogs({ targets: gauges, eventAbi: notifyRewardEvent })

    logs.forEach(log => {
      dailyBribesRevenue.add(rewardToken, log.amount)
    })
    return {
      dailyFees,
      dailyRevenue: dailyFees,
      dailyHoldersRevenue: dailyFees,
      dailyBribesRevenue,
    };
  }
}

export default uniV2Exports({
  [CHAIN.OPTIMISM]: { factory: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a', swapEvent, voter: '0x41c914ee0c7e1a5edcd0295623e6dc557b5abf3c', maxPairSize: 500, customLogic, },
  [CHAIN.MODE]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', customLogic },
  [CHAIN.BOB]: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent, customLogic, },
})
