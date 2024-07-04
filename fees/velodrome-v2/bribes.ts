import * as sdk from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';
const event_geuge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'

export const fees_bribes = async ({ getLogs, createBalances, getToBlock }: FetchOptions): Promise<sdk.Balances> => {
  const voter = '0x41c914ee0c7e1a5edcd0295623e6dc557b5abf3c';
  const dailyFees = createBalances()
  const logs_geuge_created = (await getLogs({
    target: voter,
    fromBlock: 105896851,
    toBlock: await getToBlock(),
    eventAbi: event_geuge_created,
    cacheInCloud: true,
  }))
  const bribes_contract: string[] = logs_geuge_created.map((e: any) => e.bribeVotingReward.toLowerCase());

  const logs = await getLogs({
    targets: bribes_contract,
    eventAbi: event_notify_reward,
  })
  logs.map((e: any) => {
    dailyFees.add(e.reward, e.amount)
  })
  return dailyFees;
}
