import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const dailySupplySideRevenue = options.createBalances();
  
  const logs = await options.getLogs({
    target: '0xac3e018457b222d93114458476f3e3416abbe38f',
    eventAbi: 'event NewRewardsCycle (uint32 indexed cycleEnd, uint256 rewardAmount)',
  })
  
  for (const log of logs) {
    dailySupplySideRevenue.addGasToken(log.rewardAmount);
  }
  
  // 10% protocol fees
  const dailyFees = dailySupplySideRevenue.clone(1 / 0.9);
  const dailyRevenue = dailyFees.clone(0.1);
  
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
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-10-06',
    },
  },
  methodology: {
    Fees: 'All staking rewards from ETH validators.',
    Revenue: 'Share of 10% staking rewards.',
    ProtocolRevenue: 'Share of 10% staking rewards to Frax protocol.',
    SupplySideRevenue: '90%% staking rewards are distributed to stakers.',
    HoldersRevenue: 'No revenue share to token holders.',
  }
}

export default adapter;
