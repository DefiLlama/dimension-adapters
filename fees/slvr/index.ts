import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

// SLVR — 1-minute on-chain grid lottery on Robinhood Chain (Arbitrum Orbit L2, chainId 4663).
// Native wager token is ETH. Each resolved round takes a flat 10% rake on wagers: 8% is distributed
// to veNFT stakers (SlvrVoteEscrowStaking) and 2% goes to the jackpot (paid back out to players).
// Winners keep the other 90%.
const LOTTERY = "0x284Eb4016305Fa7FbC162Fb68F27227271001c7f"; // SlvrGridLottery
const VE_STAKING = "0xaF68598eBd245DC3cB92FF16E9Ba1814DD137200"; // SlvrVoteEscrowStaking

const BET_PLACED = "event BetPlaced(uint256 indexed roundId, address indexed beneficiary, uint256 total, uint8[] squares)";
const REWARD_DISTRIBUTED = "event RewardDistributed(uint256 amount)";

const WAGERS = "Wagers"; // ETH wagered by players
const JACKPOT = "Jackpot"; // 2% of wagers routed to the jackpot pool

const fetch = async (options: FetchOptions) => {
  const [bets, rewards] = await Promise.all([
    options.getLogs({ target: LOTTERY, eventAbi: BET_PLACED }),
    options.getLogs({ target: VE_STAKING, eventAbi: REWARD_DISTRIBUTED }),
  ]);

  // Volume = total ETH wagered across all bets this period. Jackpot = 2% of each wager, routed to
  // the jackpot pool and paid back out to winning players (supply-side).
  const dailyVolume = options.createBalances();
  const jackpot = options.createBalances();
  bets.forEach((log: any) => {
    dailyVolume.addGasToken(log.total, WAGERS);
    jackpot.addGasToken((BigInt(log.total) * 2n) / 100n, JACKPOT);
  });

  // Revenue = all staker rewards, taken straight from the ETH actually distributed to veNFT stakers
  // (RewardDistributed events on SlvrVoteEscrowStaking) — the real 8% cut of every round.
  const stakerRewards = options.createBalances();
  rewards.forEach((log: any) => stakerRewards.addGasToken(log.amount, METRIC.STAKING_REWARDS));

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
  Volume: "Total ETH wagered across all lottery bets (BetPlaced events).",
  Fees: "The 10% rake taken from every round's wagers: 8% distributed to veNFT stakers plus 2% routed to the jackpot.",
  Revenue: "All staker rewards — the ETH distributed to veNFT stakers (RewardDistributed events on SlvrVoteEscrowStaking).",
  HoldersRevenue: "All staker rewards — the ETH distributed to veNFT stakers.",
  SupplySideRevenue: "The 2% of wagers routed to the jackpot pool, which is paid back out to winning players.",
};

const breakdownMethodology = {
  Volume: {
    [WAGERS]: "ETH wagered across the grid each round (BetPlaced events).",
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
