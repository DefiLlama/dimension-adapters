import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// EigenLayer calculates rewards off-chain and distributed to on-chain contracts weekly
// we count daily fees by collect daily rewards were claimed by operators and stakers on RewardsCoordinator contract
// more about EigenLayer rewards:
// - https://docs.eigenlayer.xyz/eigenlayer/economy/economy-calculation-and-formulas#total-rewards-earned
// - https://github.com/Layr-Labs/sidecar/blob/master/docs/docs/sidecar/rewards/calculation.md

const ContractAbis = {
  RewardsClaimedEvent: 'event RewardsClaimed(bytes32 root, address indexed earner, address indexed claimer, address indexed recipient, address token, uint256 claimedAmount)',
}

const RewardsCoordinatorContract = '0x7750d328b314effa365a0402ccfd489b80b0adda'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()

  const events = await options.getLogs({
    target: RewardsCoordinatorContract,
    eventAbi: ContractAbis.RewardsClaimedEvent,
  })
  for (const event of events) {
    dailyFees.add(event.token, event.claimedAmount, METRIC.STAKING_REWARDS)
  }

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Total rewards earned in EigenLayer.",
  Revenue: "No revenue, all rewards earned by suppliers.",
  SupplySideRevenue: "Total rewards are distributed to stakers and operators.",
  ProtocolRevenue: "No revenue for EigenLayer.",
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2024-07-20',
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "Rewards claimed on the RewardsCoordinator contract by EigenLayer stakers and operators.",
    },
  },
};

export default adapter;
