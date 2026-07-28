import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

const VE_STAKING = "0x7483D990d53cddE732fB6f92fab9966F80F6679d"; 

const REWARD_DISTRIBUTED = "event RewardDistributed(uint256 amount)";

const JACKPOT = "Wagers to Jackpot Vault";

const fetch = async (options: FetchOptions) => {
  const rewards = await options.getLogs({ target: VE_STAKING, eventAbi: REWARD_DISTRIBUTED })
  const stakerRewards = options.createBalances();
  rewards.forEach((log: any) => stakerRewards.addGasToken(log.amount, METRIC.STAKING_REWARDS));
  const jackpot = stakerRewards.clone(0.25, JACKPOT);
  const dailyVolume = stakerRewards.clone(12.5);

  // Fees = the full 10% rake = staker rewards (8%) + jackpot (2%).
  const dailyFees = options.createBalances();
  dailyFees.addBalances(stakerRewards);
  dailyFees.addBalances(jackpot);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: stakerRewards,
    dailyHoldersRevenue: stakerRewards,
    dailySupplySideRevenue: jackpot,
  };
};

const methodology = {
  Volume: "Total ETH wagered across all bets each round, derived from staker rewards (a flat 8% of wagers).",
  Fees: "The 10% rake taken from every round's wagers: 8% distributed to veNFT stakers plus 2% routed to the vault.",
  Revenue: "All staker rewards — the ETH distributed to veNFT stakers (RewardDistributed events on CashVoteEscrowStaking).",
  HoldersRevenue: "All staker rewards — the ETH distributed to veNFT stakers.",
  SupplySideRevenue: "The 2% of wagers routed to the vault pool, which is paid back out to winning players.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers (RewardDistributed events).",
    [JACKPOT]: "2% of wagers routed to the vault pool.",
  },
  Revenue: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers.",
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers.",
  },
  SupplySideRevenue: {
    [JACKPOT]: "2% of wagers routed to the vault pool, paid back out to winning players.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-24",
  methodology,
  breakdownMethodology,
};

export default adapter;
