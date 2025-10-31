import { ChainApi } from "@defillama/sdk";

import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions } from "../../adapters/types";

const abis = {
  "getAllDataBatch": "function getAllDataBatch(address[] bankrollIndexes) view returns ((uint256 vaultIndex, address bankrollBytesIdentifier, address vaultAddress, address bankrollTokenAddress, address shareTokenAddress, address controllerAddress, address liquidityManagerAddress)[] vaultDetails, (uint256 bankrollAmount, uint256 shareTokenAmount, uint256 epochAmount, uint256 totalAmount, uint256 totalAmountExcluding, uint64 bankrollTokenPrice, bool isProfitEpcoh, bool isProfitTotal, bool isProfitTotalExcluding)[] vaultAmounts)",
  "returnAllTimeProfitLossIncludingActiveEpoch": "function returnAllTimeProfitLossIncludingActiveEpoch() view returns (bool isProfit_, uint256 amountDelta_)",
  "epochCounter": "uint256:epochCounter",
  "currentEpochEnd": "uint256:currentEpochEnd",
  "returnNetProfitOrLossInActiveEpoch": "function returnNetProfitOrLossInActiveEpoch() view returns (bool isProfit_, uint256 amountDelta_)"
}


import {
  JUSTBET_BANKROLL_INDEXES,
  WINR_VAULT_ADAPTER_CONTRACT,
} from "./constants";

const getVaultAddresses = async (api: ChainApi) => {
  const { vaultDetails, } = await api.call({
    abi: abis.getAllDataBatch,
    target: WINR_VAULT_ADAPTER_CONTRACT,
    params: [JUSTBET_BANKROLL_INDEXES as any],
  });

  return { vaults: vaultDetails.map(i => i.vaultAddress), tokens: vaultDetails.map(i => i.bankrollTokenAddress) };
};

export default {
  adapter: {
    [CHAIN.WINR]: {
      fetch: (async ({ api, fromApi, createBalances, }: FetchOptions) => {
        const { vaults, tokens } = await getVaultAddresses(api);
        const yesterdayData = await fromApi.multiCall({ abi: abis.returnAllTimeProfitLossIncludingActiveEpoch, calls: vaults, permitFailure: true });
        const todayData = await api.multiCall({ abi: abis.returnAllTimeProfitLossIncludingActiveEpoch, calls: vaults, permitFailure: true });
        const dailyFees = createBalances()
        tokens.forEach((token, i) => {
          if (!todayData[i] || !yesterdayData[i]) return;
          const vaultProfitToday = Number(todayData[i].amountDelta_) * (todayData[i].isProfit_ ? 1 : -1)
          const vaultProfitYesterday = Number(yesterdayData[i].amountDelta_) * (yesterdayData[i].isProfit_ ? 1 : -1)
          dailyFees.add(token, vaultProfitToday - vaultProfitYesterday)
        })

        return {
          dailyFees,
          dailyRevenue: dailyFees.clone(60 / 100),
          dailyProtocolRevenue: dailyFees.clone(60 / 100),
          dailyHoldersRevenue: dailyFees.clone(20 / 100),
        };
      }),
      start: '2024-11-20',
    },
  },
  allowNegativeValue: true, // casino lose money on some days
  version: 2,
  methodology: {
    Fees: "All fees collected from user bets.",
    Revenue: "Fees collected from user bets.",
    ProtocolRevenue: "Fees are distributed to JustBet.",
    HoldersRevenue: "Fees are distributed to JustBet token holders.",
  },
} as Adapter;
