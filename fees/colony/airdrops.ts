import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

// Colony StakingV3 contract
const STAKING_CONTRACT =
  "0x62685d3EAacE96D6145D35f3B7540d35f482DE5b";

const REWARD_ADDED_EVENT =
  "event RewardAdded(address indexed token, uint8 category, uint256 amount, uint256 duration)";

export interface Airdrops {
  dailyHoldersRevenue: Balances;
}

export async function airdrops(
  options: FetchOptions,
): Promise<Airdrops> {
  const { getLogs, createBalances } = options;

  const dailyHoldersRevenue = createBalances();

  const logs = await getLogs({
    target: STAKING_CONTRACT,
    eventAbi: REWARD_ADDED_EVENT,
    topic: '0x76f4be3e874cc10b0db82373976a4b261a91b466d6a1f4db6563e5bd25ebba9e'
  });

  for (const log of logs) {
    const category = Number(log.category);
    if (category === 3 || category === 4) {
      dailyHoldersRevenue.add(
        log.token,
        log.amount
      );
    }
  }

  return {
    dailyHoldersRevenue,
  };
}
