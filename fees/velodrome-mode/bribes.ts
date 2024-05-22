import * as sdk from "@defillama/sdk";
import { FetchOptions } from '../../adapters/types';

const event_notify_reward = 'event NotifyReward(address indexed from,uint256 amount)';
const event_geuge_created = 'event StakingRewardsCreated(address indexed pool,address indexed rewardToken,address indexed stakingRewards,address creator)'

export const fees_bribes = async ({ getLogs, createBalances, getToBlock }: FetchOptions): Promise<sdk.Balances> => {
  const stakingRewardsFactory = '0xD2F998a46e4d9Dd57aF1a28EBa8C34E7dD3851D7';
  const rewardToken = '0xDfc7C877a950e49D2610114102175A06C2e3167a'; // immutable
  const dailyFees = createBalances()
  const logs_geuge_created = (await getLogs({
    target: stakingRewardsFactory,
    fromBlock: 7797181,
    toBlock: await getToBlock(),
    eventAbi: event_geuge_created,
    cacheInCloud: true,
  }))
  const bribes_contract: string[] = logs_geuge_created.map((e: any) => e.stakingRewards.toLowerCase());

  const logs = await getLogs({
    targets: bribes_contract,
    eventAbi: event_notify_reward,
  })
  logs.map((e: any) => {
    dailyFees.add(rewardToken, e.amount)
  })
  return dailyFees;
}