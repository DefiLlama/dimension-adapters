import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  getETHFeesWei,
  getERC20FeesData,
} from "./common";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { createBalances, startTimestamp, endTimestamp } = options;

  const dailyFees = createBalances();

  const ethFees = await getETHFeesWei(startTimestamp, endTimestamp);
  
  const erc20Fees = await getERC20FeesData(startTimestamp, endTimestamp);

  dailyFees.addGasToken(ethFees.stakingConsensusFeesWei);
  dailyFees.addGasToken(ethFees.stakingExecutionFeesWei);
  dailyFees.addGasToken(ethFees.rewardsDepositedFeesWei);
  dailyFees.addGasToken(ethFees.rewardsForwardedFeesWei);
  dailyFees.addGasToken(ethFees.instantWithdrawalFeesWei);
  
  for (const [tokenId, tokenFees] of erc20Fees.instantWithdrawalERC20Fees) {
    dailyFees.add(tokenId, tokenFees);
  }
  for (const [tokenId, tokenFees] of erc20Fees.vaultRewardERC20Fees) {
    dailyFees.add(tokenId, tokenFees);
  }
  for (const [tokenId, tokenFees] of erc20Fees.vaultProtocolERC20Fees) {
    dailyFees.add(tokenId, tokenFees);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      meta: {
        methodology: {
          Fees: "Fees collected from staking earnings, auto-forwarded restaking earnings, reward auction sales, instant withdrawals, and vault rewards",
          Revenue: "Fees collected from staking earnings, auto-forwarded restaking earnings, reward auction sales, instant withdrawals, and vault rewards"
        },
      },
      start: '2024-12-13' // December 13th, 2024
    }
  }
}

export default adapter;