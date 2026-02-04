import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const methodology = {
  Fees: "Total rewards earned in EigenLayer.",
  Revenue: "No revenue, all rewards earned by suppliers.",
  SupplySideRevenue: "Total rewards are distributed to stakers and operators.",
  ProtocolRevenue: "No revenue for EigenLayer.",
}

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
  const dailySupplySideRevenue = options.createBalances()

  const events = await options.getLogs({
    target: RewardsCoordinatorContract,
    eventAbi: ContractAbis.RewardsClaimedEvent,
  })
  for (const event of events) {
    dailyFees.add(event.token, event.claimedAmount, "Rewards claimed by stakers and operators")
    dailySupplySideRevenue.add(event.token, event.claimedAmount, "Rewards distributed to stakers and operators")
  }

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2024-07-20',
    },
  },
  methodology,
  breakdownMethodology: {
    Fees: {
      "Rewards claimed by stakers and operators": "Rewards claimed on the RewardsCoordinator contract by EigenLayer stakers and operators.",
    },
    SupplySideRevenue: {
      "Rewards distributed to stakers and operators": "All claimed rewards are distributed to stakers and operators as supply-side revenue.",
    },
  },
};

export default adapter;
