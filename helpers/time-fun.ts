import { FetchV2 } from "../adapters/types";

import ADDRESSES from "./coreAssets.json";

const abi = {
  "SharesRedeemed": "event SharesRedeemed((address from, uint256 shares, uint256 totalCost, uint256 feeToApp, uint256 feeToCreator, uint256 feeToShareholders, uint256 feeToReferrer, address experienceCreator, uint256 totalSupplyExperience, address referrerAddress) event_)",
  "SharesTraded": "event SharesTraded((address from, uint256 shares, bool isBuy, uint256 totalCost, uint256 feeToApp, uint256 feeToCreator, uint256 feeToShareholders, uint256 feeToReferrer, address experienceCreator, uint256 totalSupplyExperience, address referrerAddress) event_)",
}

export function getFeesExport(contractAddress: string, {
  token = ADDRESSES.null,
}: { token?: string } = {}) {
  return (async ({ getLogs, createBalances, }) => {
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const dailySupplySideRevenue = createBalances()
    const tradeLogs = await getLogs({ target: contractAddress, eventAbi: abi.SharesTraded, topics: ['0x069a3131d4d72dbdcb40a0d8ff0aa58f71096c2726da05e3ed2608ddf1e93228'] })
    const redeemLogs = await getLogs({ target: contractAddress, eventAbi: abi.SharesRedeemed, topics: ['0x58d64bdf8bc9e2ab45691bd838283f536381da0d63e5370b131650a085f846c6'] })
    const addFees = ([e]: any) => {

      dailyFees.add(token, e.feeToApp)
      dailyFees.add(token, e.feeToCreator)
      dailyFees.add(token, e.feeToShareholders)
      dailyFees.add(token, e.feeToReferrer)

      dailyRevenue.add(token, e.feeToApp)
      dailySupplySideRevenue.add(token, e.feeToShareholders)
    }

    tradeLogs.map(addFees)
    redeemLogs.map(addFees)

    return { dailyFees, dailyRevenue, dailySupplySideRevenue, }
  }) as FetchV2
}