import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const LABELS = {
  StakingRewards: 'frxETH Staking Rewards',
  ProtocolFee: 'frxETH Protocol Fee',
  StakerRewards: 'frxETH Staker Rewards',
}

const fetch = async (options: FetchOptions) => {
  const rewards = options.createBalances();

  const logs = await options.getLogs({
    target: '0xac3e018457b222d93114458476f3e3416abbe38f',
    eventAbi: 'event NewRewardsCycle (uint32 indexed cycleEnd, uint256 rewardAmount)',
  })

  // Emitted rewardAmount is the 90% share distributed to stakers.
  for (const log of logs) {
    rewards.addGasToken(log.rewardAmount);
  }

  // Gross fees = staker rewards / 0.9; protocol keeps a 10% fee.
  const dailyFees = rewards.clone(1 / 0.9, LABELS.StakingRewards);
  const dailyRevenue = dailyFees.clone(0.1, LABELS.ProtocolFee);
  const dailySupplySideRevenue = rewards.clone(1, LABELS.StakerRewards);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
    dailyUserFees: 0,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-12-22',
    },
  },
  methodology: {
    Fees: 'All staking rewards from ETH validators.',
    Revenue: 'Share of 10% staking rewards.',
    ProtocolRevenue: 'Share of 10% staking rewards to Frax protocol.',
    SupplySideRevenue: '90% of staking rewards are distributed to stakers.',
    HoldersRevenue: 'No revenue share to token holders.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.StakingRewards]: 'All staking rewards from ETH validators.',
    },
    Revenue: {
      [LABELS.ProtocolFee]: '10% of staking rewards taken as protocol fee.',
    },
    ProtocolRevenue: {
      [LABELS.ProtocolFee]: '10% of staking rewards kept by the Frax protocol.',
    },
    SupplySideRevenue: {
      [LABELS.StakerRewards]: '90% of staking rewards distributed to stakers.',
    },
  }
}

export default adapter;
