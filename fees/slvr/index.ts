import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

// SLVR — 1-minute on-chain grid lottery on Robinhood Chain (Arbitrum Orbit L2, chainId 4663).
// Native wager token is ETH. Each resolved round takes a flat 10% rake on wagers: 8% is distributed
// to veNFT stakers (SlvrVoteEscrowStaking) and 2% goes to the jackpot (paid back out to players).
// Winners keep the other 90%.
const VE_STAKING = "0xaF68598eBd245DC3cB92FF16E9Ba1814DD137200"; // SlvrVoteEscrowStaking

const REWARD_DISTRIBUTED = "event RewardDistributed(uint256 amount)";

const JACKPOT = "Jackpot"; // 2% of wagers routed to the jackpot pool
const WAGERS = "Wagers"; // ETH wagered by players

const fetch = async (options: FetchOptions) => {
  const rewards = await options.getLogs({ target: VE_STAKING, eventAbi: REWARD_DISTRIBUTED })
  // Revenue = all staker rewards, taken straight from the ETH actually distributed to veNFT stakers
  // (RewardDistributed events on SlvrVoteEscrowStaking) — the real 8% cut of every round.
  const stakerRewards = options.createBalances();
  rewards.forEach((log: any) => stakerRewards.addGasToken(log.amount, METRIC.STAKING_REWARDS));
  const jackpot = stakerRewards.clone(0.25, JACKPOT);
  // Volume = ETH wagered per round. Staker rewards are a flat 8% of each round's wagers,
  // so wagers = rewards / 0.08, without a second getLogs query (BetPlaced) against the
  // rate-limited Robinhood RPC.
  const dailyVolume = stakerRewards.clone(12.5, WAGERS);

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
  Volume: "Total ETH wagered across all lottery bets each round, derived from staker rewards (a flat 8% of wagers).",
  Fees: "The 10% rake taken from every round's wagers: 8% distributed to veNFT stakers plus 2% routed to the jackpot.",
  Revenue: "All staker rewards — the ETH distributed to veNFT stakers (RewardDistributed events on SlvrVoteEscrowStaking).",
  HoldersRevenue: "All staker rewards — the ETH distributed to veNFT stakers.",
  SupplySideRevenue: "The 2% of wagers routed to the jackpot pool, which is paid back out to winning players.",
};

const breakdownMethodology = {
  Volume: {
    [WAGERS]: "ETH wagered across the grid each round, derived as staker rewards / 0.08 (the flat 8% staker cut of wagers).",
  },
  Fees: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers (RewardDistributed events).",
    [JACKPOT]: "2% of wagers routed to the jackpot pool.",
  },
  Revenue: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers.",
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers.",
  },
  SupplySideRevenue: {
    [JACKPOT]: "2% of wagers routed to the jackpot pool, paid back out to winning players.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-09",
  methodology,
  breakdownMethodology,
};

export default adapter;
