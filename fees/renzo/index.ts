import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  getStakingConsensusFeesWei,
  getStakingExecutionFeesWei,
  getRewardsDepositedFeesWei,
  getRewardsForwardedFeesWei,
  getInstantWithdrawalFeesWei,
  getInstantWithdrawalERC20Fees,
  getVaultRewardERC20Fees,
  getVaultProtocolERC20Fees,
} from "./queries";
import { NATIVE_ETH } from "./constants";

const fetch = async (options: FetchOptions) => {
  const { createBalances, startTimestamp, endTimestamp } = options;

  // Create dailyFees balance object
  const dailyFees = createBalances();

  // Query fee data...
  // ETH Fees
  const stakingConsensusFeesWei = await getStakingConsensusFeesWei(startTimestamp, endTimestamp);
  const stakingExecutionFeesWei = await getStakingExecutionFeesWei(startTimestamp, endTimestamp);
  const rewardsDepositedFeesWei = await getRewardsDepositedFeesWei(startTimestamp, endTimestamp);
  const rewardsForwardedFeesWei = await getRewardsForwardedFeesWei(startTimestamp, endTimestamp);
  const instantWithdrawalFeesWei = await getInstantWithdrawalFeesWei(startTimestamp, endTimestamp);
  // ERC20 Fees
  const vaultRewardERC20Fees = await getVaultRewardERC20Fees(startTimestamp, endTimestamp);
  const vaultProtocolERC20Fees = await getVaultProtocolERC20Fees(startTimestamp, endTimestamp);
  const instantWithdrawalERC20Fees = await getInstantWithdrawalERC20Fees(startTimestamp, endTimestamp);

  // Add all ETH fees to dailyFees
  dailyFees.add(NATIVE_ETH, stakingConsensusFeesWei);
  dailyFees.add(NATIVE_ETH, stakingExecutionFeesWei);
  dailyFees.add(NATIVE_ETH, rewardsDepositedFeesWei);
  dailyFees.add(NATIVE_ETH, rewardsForwardedFeesWei);
  dailyFees.add(NATIVE_ETH, instantWithdrawalFeesWei);
  
  // Add all ERC20 fees to dailyFees
  for (const [tokenId, tokenFees] of instantWithdrawalERC20Fees) {
    dailyFees.add(tokenId, tokenFees);
  }
  for (const [tokenId, tokenFees] of vaultRewardERC20Fees) {
    dailyFees.add(tokenId, tokenFees);
  }
  for (const [tokenId, tokenFees] of vaultProtocolERC20Fees) {
    dailyFees.add(tokenId, tokenFees);
  }

  // Return results
  return {
    dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      meta: {
        methodology: {
          Fees: "Fees collected from staking earnings, auto-forwarded restaking earnings, reward auction sales, instant withdrawals, and vault rewards",
        },
      },
      start: '2024-12-13' // December 13th, 2024
    }
  }
}

export default adapter;