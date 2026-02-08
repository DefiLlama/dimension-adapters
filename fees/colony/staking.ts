import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

// Colony StakingV3 contract
const STAKING_CONTRACT =
  "0x62685d3EAacE96D6145D35f3B7540d35f482DE5b";

// https://docs.colonylab.io/getting-started/start-your-journey/stake-cly-to-access-colony 
// Event ABIs
const STAKING_EVENTS = {
  stakeFee: "event StakeFeeCollected(address indexed user, uint256 fee)",
  unstakeFee: "event UnstakeFeeCollected(address indexed staker, uint256 value)",
};

// Event topics
const STAKING_TOPICS = {
  stakeFee: "0x776042b4aeec91acee68cf891261a42a23bbfda97b8403c2261fe6b469a1810e",
  unstakeFee: "0x2e1dd4c6121af8cdd5eef463852430bc328164f1d8124ee4ab17effaaf473e51",
};

export async function stakingFees(
  options: FetchOptions,
  ColonyGovernanceToken: string,
): Promise<{
  dailyHoldersRevenue: Balances;
}> {
  const { getLogs } = options;
  const dailyHoldersRevenue = options.createBalances();

  // Fetch both stake and unstake fee events
  const [stakeFeeLogs, unstakeFeeLogs] = await Promise.all([
    getLogs({
      target: STAKING_CONTRACT,
      eventAbi: STAKING_EVENTS.stakeFee,
      topics: [STAKING_TOPICS.stakeFee],
    }),
    getLogs({
      target: STAKING_CONTRACT,
      eventAbi: STAKING_EVENTS.unstakeFee,
      topics: [STAKING_TOPICS.unstakeFee],
    }),
  ]);

  let stakeFees = 0;
  let unstakeFees = 0;

  // Sum stake fees
  for (const log of stakeFeeLogs) {
    stakeFees += Number(log.fee);
  }

  // Sum unstake fees
  for (const log of unstakeFeeLogs) {
    unstakeFees += Number(log.value);
  }

  const totalFees = stakeFees + unstakeFees;

  // Add total fees to holders revenue
  dailyHoldersRevenue.add(
    ColonyGovernanceToken,
    totalFees
  );

  return {
    dailyHoldersRevenue,
  };
}
