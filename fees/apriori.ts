import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// https://apriori-docs.gitbook.io/apriori-docs
// https://apriori-docs.gitbook.io/apriori-docs/aprmon/aprmon-basics/staking-yield
const aprMON = "0x0c65A0BC65a5D819235B71F554D210D3F80E0852";

const events = {
  EpochRewardsUpdated: "event EpochRewardsUpdated(uint256 blockNumber, uint256 rewardsDistributing)",
  Redeem: "event Redeem(address indexed controller, address indexed receiver, uint256 indexed requestId, uint256 shares, uint256 assets, uint256 fee)",
};

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // EpochRewardsUpdated gives total staking rewards
  const rewardLogs = await getLogs({
    target: aprMON,
    eventAbi: events.EpochRewardsUpdated,
  });

  let totalRewards = BigInt(0);
  for (const log of rewardLogs) {
    totalRewards += BigInt(log.rewardsDistributing);
  }

  // Redeem events contain withdrawal fees
  const redeemLogs = await getLogs({
    target: aprMON,
    eventAbi: events.Redeem,
  });

  let totalWithdrawalFees = BigInt(0);
  for (const log of redeemLogs) {
    totalWithdrawalFees += BigInt(log.fee);
  }

  // Protocol takes 10% of staking rewards
  const protocolRewardFees = totalRewards / BigInt(10);
  const supplySideRewards = totalRewards - protocolRewardFees;

  // dailyFees = total staking rewards + withdrawal fees
  dailyFees.addGasToken(supplySideRewards, METRIC.STAKING_REWARDS);
  dailyFees.addGasToken(totalWithdrawalFees, METRIC.DEPOSIT_WITHDRAW_FEES);
  dailyFees.addGasToken(protocolRewardFees, METRIC.PROTOCOL_FEES)

  // dailyRevenue = 10% of staking rewards + withdrawal fees
  dailyRevenue.addGasToken(protocolRewardFees, METRIC.PROTOCOL_FEES);
  dailyRevenue.addGasToken(totalWithdrawalFees, METRIC.DEPOSIT_WITHDRAW_FEES);

  // dailySupplySideRevenue = 90% of staking rewards
  dailySupplySideRevenue.addGasToken(supplySideRewards, METRIC.STAKING_REWARDS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2025-05-01",
    },
  },
  methodology: {
    Fees: "Total MON staking rewards earned by aprMON holders plus withdrawal fees.",
    Revenue: "10% fee on staking rewards plus 0.1% withdrawal fees collected by aPriori protocol.",
    ProtocolRevenue: "10% fee on staking rewards plus 0.1% withdrawal fees collected by aPriori protocol.",
    SupplySideRevenue: "90% of staking rewards distributed to aprMON holders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "MON staking rewards from consensus and execution layer validators.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% withdrawal fee charged when redeeming aprMON.",
      [METRIC.PROTOCOL_FEES]: "10% protocol fee on staking rewards.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "10% protocol fee on staking rewards.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% withdrawal fee collected by aPriori protocol.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "10% protocol fee on staking rewards.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% withdrawal fee collected by aPriori protocol.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "90% of staking rewards distributed to aprMON holders.",
    },
  },
};

export default adapter;
