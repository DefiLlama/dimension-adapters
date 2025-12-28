import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

const STAKING_CONTRACT = "0x62685d3EAacE96D6145D35f3B7540d35f482DE5b";

const STAKING_EVENTS = {
  rewardClaimed:
    "event RewardClaimed(address indexed token, uint8 category, address indexed staker, address indexed receiver, uint256 amount)",
};

const STAKING_TOPICS = {
  customRewardClaimed: "0xbe3849fc1d848d4373d062cde883fc3119388f753301a0ba238d4fcc7f75d5f6",
};

export interface Airdrops {
  dailyHoldersRevenue: Balances;
}

export async function airdrops(
  options: FetchOptions
): Promise<Airdrops> {
  const { getLogs, createBalances } = options;
  const dailyHoldersRevenue = createBalances();

  const rewardLogs = await getLogs({
    target: STAKING_CONTRACT,
    eventAbi: STAKING_EVENTS.rewardClaimed,
    topics: [STAKING_TOPICS.customRewardClaimed],
  });

  // Only sum events with category 3 or 4
  for (const log of rewardLogs) {
    if (log.category === 3n || log.category === 4n) {
      dailyHoldersRevenue.add(log.token, log.amount);
    }
  }

  return {
    dailyHoldersRevenue,
  };
}
