import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// https://apriori-docs.gitbook.io/apriori-docs
// https://apriori-docs.gitbook.io/apriori-docs/aprmon/aprmon-basics/staking-yield
const aprMON = "0x0c65A0BC65a5D819235B71F554D210D3F80E0852";

const abis = {
  EpochRewardsUpdated: "event EpochRewardsUpdated(uint256 blockNumber, uint256 rewardsDistributing)",
  Redeem: "event Redeem(address indexed controller, address indexed receiver, uint256 indexed requestId, uint256 shares, uint256 assets, uint256 fee)",
  rewardFee: "function rewardFee() view returns (uint8)",
};

const fetch = async ({ createBalances, getLogs, api }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Read reward fee percentage from contract (uint8, e.g. 10 = 10%)
  const rewardFeePercent = await api.call({ target: aprMON, abi: abis.rewardFee });

  // EpochRewardsUpdated gives net staking rewards (after protocol fee deduction)
  const rewardLogs = await getLogs({
    target: aprMON,
    eventAbi: abis.EpochRewardsUpdated,
  });

  let netRewards = BigInt(0);
  for (const log of rewardLogs) {
    netRewards += BigInt(log.rewardsDistributing);
  }

  // Redeem events contain withdrawal fees
  const redeemLogs = await getLogs({
    target: aprMON,
    eventAbi: abis.Redeem,
  });

  let totalWithdrawalFees = BigInt(0);
  for (const log of redeemLogs) {
    totalWithdrawalFees += BigInt(log.fee);
  }

  // netRewards is after fee deduction, gross = net * 100 / (100 - feePercent)
  const feePercent = BigInt(rewardFeePercent);
  const grossRewards = netRewards * BigInt(100) / (BigInt(100) - feePercent);
  const protocolFees = grossRewards - netRewards;

  dailyFees.addGasToken(grossRewards, METRIC.STAKING_REWARDS);
  dailyFees.addGasToken(totalWithdrawalFees, METRIC.DEPOSIT_WITHDRAW_FEES);

  dailyRevenue.addGasToken(protocolFees, 'Staking Rewards Commission');
  dailyRevenue.addGasToken(totalWithdrawalFees, METRIC.DEPOSIT_WITHDRAW_FEES);

  dailySupplySideRevenue.addGasToken(netRewards, 'Staking Rewards To Stakers');

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
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2025-11-24",
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
      [METRIC.STAKING_REWARDS]: "Gross MON staking rewards from consensus and execution layer validators.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% withdrawal fee charged when redeeming aprMON.",
    },
    Revenue: {
      'Staking Rewards Commission': "10% protocol fee on staking rewards.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% withdrawal fee collected by aPriori protocol.",
    },
    ProtocolRevenue: {
      'Staking Rewards Commission': "10% protocol fee on staking rewards.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% withdrawal fee collected by aPriori protocol.",
    },
    SupplySideRevenue: {
      'Staking Rewards To Stakers': "90% of staking rewards distributed to aprMON holders.",
    },
  },
};

export default adapter;
