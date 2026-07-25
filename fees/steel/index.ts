import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

// STEEL — on-chain grid-mining lottery + veSTEEL staking on Robinhood Chain (Arbitrum Orbit L2, chainId 4663).
// Native wager token is ETH. Each resolved round takes a flat 10% rake on the pot: 6% is distributed
// to veSTEEL stakers (VeSteelV2), 2% self-funds the keeper, and 2% goes to the motherlode (paid back
// out to winning players). Winners keep the other 90%.
const VE_STEEL = "0xD5116ca699eD6CA186BC07f46B3c851D1A483aa2"; // VeSteelV2 staking

const REWARD_NOTIFIED = "event RewardNotified(uint256 eth)";

const KEEPER = "Keeper";
const MOTHERLODE = "Motherlode";

const fetch = async (options: FetchOptions) => {
  const rewards = await options.getLogs({ target: VE_STEEL, eventAbi: REWARD_NOTIFIED });
  // Staker rewards = the ETH actually distributed to veSTEEL stakers (RewardNotified events),
  // a flat 6% of every round's pot.
  const stakerRewards = options.createBalances();
  rewards.forEach((log: any) => stakerRewards.addGasToken(log.eth, METRIC.STAKING_REWARDS));

  // Derive the other cuts from the fixed split (staker = 6% of pot).
  const keeper = stakerRewards.clone(2 / 6, KEEPER); // 2% keeper self-funding
  const motherlode = stakerRewards.clone(2 / 6, MOTHERLODE); // 2% paid back to winners
  const dailyVolume = stakerRewards.clone(1 / 0.06); // total ETH wagered = staker rewards / 6%

  // Fees = the full 10% rake = stakers (6%) + keeper (2%) + motherlode (2%).
  const dailyFees = options.createBalances();
  dailyFees.addBalances(stakerRewards);
  dailyFees.addBalances(keeper);
  dailyFees.addBalances(motherlode);

  // Revenue = protocol-retained portion (stakers + keeper); the motherlode is returned to players.
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(stakerRewards);
  dailyRevenue.addBalances(keeper);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: stakerRewards,
    dailySupplySideRevenue: motherlode,
  };
};

const methodology = {
  Volume: "Total ETH wagered across all lottery rounds, derived from staker rewards (a flat 6% of each round's pot).",
  Fees: "The 10% rake taken from every round's pot: 6% to veSTEEL stakers, 2% to the keeper, and 2% to the motherlode.",
  Revenue: "Protocol-retained fees: staker rewards (6%) plus the keeper self-funding cut (2%).",
  HoldersRevenue: "All staker rewards — the ETH distributed to veSTEEL stakers (RewardNotified events on VeSteelV2).",
  SupplySideRevenue: "The 2% of each pot routed to the motherlode, paid back out to winning players.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "6% of each pot distributed to veSTEEL stakers (RewardNotified events).",
    [KEEPER]: "2% of each pot self-funding the keeper.",
    [MOTHERLODE]: "2% of each pot routed to the motherlode.",
  },
  Revenue: {
    [METRIC.STAKING_REWARDS]: "6% of each pot distributed to veSTEEL stakers.",
    [KEEPER]: "2% of each pot self-funding the keeper.",
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "6% of each pot distributed to veSTEEL stakers.",
  },
  SupplySideRevenue: {
    [MOTHERLODE]: "2% of each pot routed to the motherlode, paid back out to winning players.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-17",
  methodology,
  breakdownMethodology,
};

export default adapter;
