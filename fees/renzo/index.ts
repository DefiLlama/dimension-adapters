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

  // Init empty balances for fees & earnings
  const dailyFees = createBalances();
  const dailyEarnings = createBalances();

  // Add ETH fees
  dailyFees.addGasToken(ethFees.stakingConsensusFeesWei);
  dailyFees.addGasToken(ethFees.stakingExecutionFeesWei);
  dailyFees.addGasToken(ethFees.rewardsDepositedFeesWei);
  dailyFees.addGasToken(ethFees.rewardsForwardedFeesWei);
  dailyFees.addGasToken(ethFees.instantWithdrawalFeesWei);

  // Add ERC20 fees
  for (const [tokenId, tokenFees] of erc20Fees.instantWithdrawalERC20Fees) {
    dailyFees.add(tokenId, tokenFees);
  }
  for (const [tokenId, tokenFees] of erc20Fees.vaultRewardERC20Fees) {
    dailyFees.add(tokenId, tokenFees);
  }
  for (const [tokenId, tokenFees] of erc20Fees.vaultProtocolERC20Fees) {
    dailyFees.add(tokenId, tokenFees);
  }

  // Add ETH earnings
  dailyEarnings.addGasToken(ethEarnings.stakingConsensusEarningsWei);
  dailyEarnings.addGasToken(ethEarnings.stakingExecutionEarningsWei);
  dailyEarnings.addGasToken(ethEarnings.rewardsDepositedEarningsWei);
  dailyEarnings.addGasToken(ethEarnings.rewardsForwardedEarningsWei);
  dailyEarnings.addGasToken(ethEarnings.lidoDistributionEarningsWei);

  // Add ERC20 earnings
  for (const [tokenId, tokenEarnings] of erc20Earnings.vaultDepositedERC20Earnings) {
    dailyEarnings.add(tokenId, tokenEarnings);
  }
  for (const [tokenId, tokenEarnings] of erc20Earnings.vaultForwardedERC20Earnings) {
    dailyEarnings.add(tokenId, tokenEarnings);
  }

  // Calculate revenue balances by combining fees & earnings
  const dailyRevenue = createBalances();
  dailyRevenue.addBalances(dailyFees.getBalances());
  dailyRevenue.addBalances(dailyEarnings.getBalances());

  return {
    dailyFees,
    dailyRevenue
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      meta: {
        methodology: {
          Fees: "Fees collected from staking, restaking, vaults, and instant withdrawals",
          Revenue: "Combined fees & earnings from staking, restaking, vaults, instant withdrawals, and Lido distributions."
        },
      },
      start: '2024-09-04' // September 4th, 2024 -- M4 EigenPod Upgrade
    }
  }
}

export default adapter;