import ADDRESSES from '../../helpers/coreAssets.json';
import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

// WAVAX token
const wavaxToken = ADDRESSES.avax.WAVAX;

// StakingV3 contract
const STAKING_CONTRACT = "0x62685d3EAacE96D6145D35f3B7540d35f482DE5b";

// Event ABIs for validator rewards
const STAKING_EVENTS = {
  rewardClaimed:
    "event RewardClaimed(address indexed token, uint8 category, address indexed staker, address indexed receiver, uint256 amount)",
};

// Topic for RewardClaimed
const STAKING_TOPICS = {
  rewardClaimed: "0xbe3849fc1d848d4373d062cde883fc3119388f753301a0ba238d4fcc7f75d5f6",
};

export interface ValidatorProgramFees {
  dailyProtocolRevenue: Balances;
  dailyHoldersRevenue: Balances;
}

export async function validatorProgramFees(
  options: FetchOptions,
): Promise<ValidatorProgramFees> {
  const { getLogs, createBalances } = options;

  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  // Fetch RewardClaimed events
  const rewardLogs = await getLogs({
    target: STAKING_CONTRACT,
    eventAbi: STAKING_EVENTS.rewardClaimed,
    topics: [STAKING_TOPICS.rewardClaimed],
  });

  let totalReward = 0n;

  // Sum the total reward
  for (const log of rewardLogs) {
    if (log.token.toLowerCase() === wavaxToken.toLowerCase() &&
    Number(log.category) === 1) {
      totalReward += log.amount;
    }
  }

  const holdersShare = totalReward;
  const protocolShare = (totalReward * 3n) / 7n;

  dailyProtocolRevenue.add(wavaxToken, protocolShare);
  dailyHoldersRevenue.add(wavaxToken, holdersShare);

  return {
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
}
