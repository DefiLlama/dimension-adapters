import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// https://docs.stakingverse.io/services-lukso
// https://github.com/Stakingverse/pool-contracts
const LUKSO_VAULT = "0x9F49a95b0c3c9e2A6c77a16C177928294c0F6F04";
const REWARDS_DISTRIBUTED = "event RewardsDistributed(uint256 balance, uint256 rewards, uint256 fee)";

// https://docs.stakingverse.io/services-ethereum
// StakeWise V3 vault on Ethereum
const ETH_VAULT = "0x8A93A876912c9F03F88Bc9114847cf5b63c89f56";
const FEE_SHARES_MINTED = "event FeeSharesMinted(address receiver, uint256 shares, uint256 assets)";
const MAX_FEE_PERCENT = 10_000;

const fetchLukso = async (options: FetchOptions) => {
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

const fetchEthereum = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [feeLogs, feePercent] = await Promise.all([
    options.getLogs({ target: ETH_VAULT, eventAbi: FEE_SHARES_MINTED }),
    options.api.call({ target: ETH_VAULT, abi: "function feePercent() view returns (uint16)" }),
  ]);

  const totalFees = feeLogs.map((log: any) => Number(log.assets)).reduce((a: number, b: number) => a + b, 0);
  const totalRewards = (totalFees * MAX_FEE_PERCENT) / Number(feePercent);

  dailyFees.addGasToken(totalRewards, METRIC.STAKING_REWARDS);
  dailyRevenue.addGasToken(totalFees, METRIC.PERFORMANCE_FEES);
  dailySupplySideRevenue.addGasToken(totalRewards - totalFees, METRIC.STAKING_REWARDS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total staking rewards (LYX on LUKSO, ETH on Ethereum) distributed to Stakingverse pool validators.",
  Revenue: "Stakingverse takes a performance fee on distributed profits to cover operational costs and feature development.",
  ProtocolRevenue: "Stakingverse takes a performance fee on distributed profits to cover operational costs and feature development.",
  SupplySideRevenue: "Rewards distributed to stakers after the protocol performance fee.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Staking rewards distributed to the Stakingverse pool by its validators.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fee deducted from distributed rewards by the Stakingverse protocol.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fee collected by Stakingverse to fund operations and development.",
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: "Pool rewards distributed to stakers after the protocol performance fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  adapter: {
    [CHAIN.LUKSO]: {
      fetch: fetchLukso,
      start: "2024-02-29",
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: "2023-11-20",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;