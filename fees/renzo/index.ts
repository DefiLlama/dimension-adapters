import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  getETHFeesWei,
  getETHEarningsWei,
  getERC20FeesData,
  getERC20EarningsData
} from "./common";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { createBalances, startTimestamp, endTimestamp } = options;

  // Query data
  const ethFees = await getETHFeesWei(startTimestamp, endTimestamp);
  const erc20Fees = await getERC20FeesData(startTimestamp, endTimestamp);
  const ethEarnings = await getETHEarningsWei(startTimestamp, endTimestamp);
  const erc20Earnings = await getERC20EarningsData(startTimestamp, endTimestamp);

  // Init empty balances for payments either retained or re-distributed by the protocol
  const retainedBalances = createBalances();
  const distributedBalances = createBalances();

  // Add ETH fees
  retainedBalances.addGasToken(ethFees.stakingConsensusFeesWei);
  retainedBalances.addGasToken(ethFees.stakingExecutionFeesWei);
  retainedBalances.addGasToken(ethFees.rewardsDepositedFeesWei);
  retainedBalances.addGasToken(ethFees.rewardsForwardedFeesWei);
  retainedBalances.addGasToken(ethFees.instantWithdrawalFeesWei);

  // Add ERC20 fees
  for (const [tokenId, tokenFees] of erc20Fees.instantWithdrawalERC20Fees) {
    retainedBalances.add(tokenId, tokenFees);
  }
  for (const [tokenId, tokenFees] of erc20Fees.vaultRewardERC20Fees) {
    retainedBalances.add(tokenId, tokenFees);
  }
  for (const [tokenId, tokenFees] of erc20Fees.vaultProtocolERC20Fees) {
    retainedBalances.add(tokenId, tokenFees);
  }

  // Add ETH earnings
  distributedBalances.addGasToken(ethEarnings.stakingConsensusEarningsWei);
  distributedBalances.addGasToken(ethEarnings.stakingExecutionEarningsWei);
  distributedBalances.addGasToken(ethEarnings.rewardsDepositedEarningsWei);
  distributedBalances.addGasToken(ethEarnings.rewardsForwardedEarningsWei);
  distributedBalances.addGasToken(ethEarnings.lidoDistributionEarningsWei);

  // Add ERC20 earnings
  for (const [tokenId, tokenEarnings] of erc20Earnings.vaultDepositedERC20Earnings) {
    distributedBalances.add(tokenId, tokenEarnings);
  }
  for (const [tokenId, tokenEarnings] of erc20Earnings.vaultForwardedERC20Earnings) {
    distributedBalances.add(tokenId, tokenEarnings);
  }

  // Daily fees:
  // All fees and value collected from all sources.
  // This represents the total value flow into the protocol's ecosystem due to its operation.
  const dailyFees = options.createBalances();
  dailyFees.addBalances(retainedBalances.getBalances());
  dailyFees.addBalances(distributedBalances.getBalances());

  // Daily revenue:
  // The portion of dailyFees kept by the protocol entity itself,
  // distributed either to the treasury (dailyProtocolRevenue)
  // or governance token holders (dailyHoldersRevenue).
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(retainedBalances.getBalances());

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-09-04' // September 4th, 2024 -- M4 EigenPod Upgrade
    }
  },
  methodology: {
    Fees: "Value earned by the protocol through staking, restaking, vault rewards, instant withdrawal fees, and Lido distributions",
    Revenue: "Value retained by the protocol through staking, restaking, vault rewards, and instant withdrawal fees.",
    ProtocolRevenue: "Value retained by the protocol through staking, restaking, vault rewards, and instant withdrawal fees."
  },
}

export default adapter;