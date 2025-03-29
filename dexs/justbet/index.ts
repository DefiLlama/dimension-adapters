import { ethers } from 'ethers'

import { CHAIN } from "../../helpers/chains";
import { Adapter, } from "../../adapters/types";
import {
  JUSTBET_BANKROLL_INDEXES,
  WINR_VAULT_ADAPTER_CONTRACT,
} from "./constants";

const abis = {
  "returnEpochResultInActiveEpochByAddress": "function returnEpochResultInActiveEpochByAddress(address _bankrollIdentifierAddress) view returns ((uint256 totalPaidInNoRakeUSD, uint256 totalPaidInRakedUSD, uint256 totalPaidOutNoRakeUSD, uint256 totalPaidOutRakedUSD, uint256 totalPaidInAllTimeUSD, uint256 totalPaidOutAllTimeUSD, uint256 secondsLeftInEpoch) epochResult_)",
  "returnBankrollTokenInfoByAddress": "function returnBankrollTokenInfoByAddress(address _bankrollIdentifierAddress) external view returns ((uint8 tokenType, address tokenAddress, string name, string symbol, uint8 decimals, uint256 totalAmount, uint256 priceInUSD, uint256 assetRatio, uint256 totalAmountInUsd) tokenInfo_)",
  "getAllDataBatch": "function getAllDataBatch(address[] bankrollIndexes) view returns ((uint256 vaultIndex, address bankrollBytesIdentifier, address vaultAddress, address bankrollTokenAddress, address shareTokenAddress, address controllerAddress, address liquidityManagerAddress)[] vaultDetails_, (uint256 bankrollAmount, uint256 shareTokenAmount, uint256 epochAmount, uint256 totalAmount, uint256 totalAmountExcluding, uint64 bankrollTokenPrice, bool isProfitEpcoh, bool isProfitTotal, bool isProfitTotalExcluding)[] vaultAmounts_)"
}


export default {
  adapter: {
    [CHAIN.WINR]: {
      fetch: (async ({ api, fromApi, }) => {
        const volumeDetails = await api.multiCall({ abi: abis.returnEpochResultInActiveEpochByAddress, calls: JUSTBET_BANKROLL_INDEXES as any, target: WINR_VAULT_ADAPTER_CONTRACT, permitFailure: true })
        const volumeDetailsYesterday = await fromApi.multiCall({ abi: abis.returnEpochResultInActiveEpochByAddress, calls: JUSTBET_BANKROLL_INDEXES as any, target: WINR_VAULT_ADAPTER_CONTRACT, permitFailure: true })
        const vaultCurrentPrices = await api.multiCall({ abi: abis.returnBankrollTokenInfoByAddress, calls: JUSTBET_BANKROLL_INDEXES as any, target: WINR_VAULT_ADAPTER_CONTRACT, permitFailure: true })
        
        let dailyVolume = 0
        let totalVolume = 0
        
        volumeDetails.forEach((vault, i) => {
          if (!vault || !volumeDetailsYesterday[i] || !vaultCurrentPrices[i]) return;
          
          const vaultDecimal = Number(vaultCurrentPrices[i].decimals)
          const vaultCurrentPrice = Number(ethers.formatUnits(vaultCurrentPrices[i].priceInUSD, 8))
          const totalVolumeUSDToday = Number(ethers.formatUnits(vault.totalPaidOutAllTimeUSD, vaultDecimal)) * vaultCurrentPrice
          const totalVolumeUSDYesterday = Number(ethers.formatUnits(volumeDetailsYesterday[i].totalPaidOutAllTimeUSD, vaultDecimal)) * vaultCurrentPrice          

          dailyVolume += totalVolumeUSDToday - totalVolumeUSDYesterday
          totalVolume += totalVolumeUSDToday
        })

        return { totalVolume, dailyVolume }

      }),
      start: 1732060800,
    },
  },
  version: 2,
} as Adapter;
