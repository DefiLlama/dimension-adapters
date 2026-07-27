import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// https://docs.stakingverse.io/services-lukso
// https://github.com/Stakingverse/pool-contracts
const LUKSO_VAULT = "0x9F49a95b0c3c9e2A6c77a16C177928294c0F6F04";
const REWARDS_DISTRIBUTED = "event RewardsDistributed(uint256 balance, uint256 rewards, uint256 fee)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: LUKSO_VAULT,
    eventAbi: REWARDS_DISTRIBUTED,
  });

  for (const log of logs) {
    const rewards = log.rewards;
    const fee = log.fee;

    dailyFees.addGasToken(rewards, METRIC.STAKING_REWARDS);
    dailyRevenue.addGasToken(fee, METRIC.PERFORMANCE_FEES);
    dailySupplySideRevenue.addGasToken(rewards - fee, METRIC.STAKING_REWARDS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  adapter: {
    [CHAIN.LUKSO]: {
      fetch,
      start: "2024-02-29",
    },
  },
  methodology: {
    Fees: "Total LYX staking rewards distributed to the Stakingverse pool by its validators.",
    Revenue: "Stakingverse takes a 10% performance fee on distributed profits to cover operational costs and feature development.",
    ProtocolRevenue: "Stakingverse takes a 10% performance fee on distributed profits to cover operational costs and feature development.",
    SupplySideRevenue: "90% of rewards distributed to sLYX holders after the 10% protocol fee.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "LYX staking rewards distributed to the Stakingverse pool by its validators.",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "10% performance fee deducted from distributed rewards by the Stakingverse protocol.",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "10% performance fee collected by Stakingverse to fund operations and development.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "90% of pool rewards distributed to sLYX holders after the 10% protocol fee.",
    },
  },
};

export default adapter;