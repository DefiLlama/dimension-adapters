import * as sdk from "@defillama/sdk";
import { FetchOptions } from '../../adapters/types';

const event_notify_reward = 'event NotifyReward(address indexed from,uint256 amount)';
const event_geuge_created = 'event StakingRewardsCreated(address indexed pool,address indexed rewardToken,address indexed stakingRewards,address creator)'

export const fees_bribes = async ({ getLogs, createBalances, getToBlock }: FetchOptions): Promise<sdk.Balances> => {
  const stakingRewardsFactory = '0x8Eb6838B4e998DA08aab851F3d42076f21530389';
  const rewardToken = '0x4200000000000000000000000000000000000006'; // immutable
  const dailyFees = createBalances()
  const logs_geuge_created = (await getLogs({
    target: stakingRewardsFactory,
    fromBlock: 1723513,
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