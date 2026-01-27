import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const reUSD = "0x57aB1E0003F623289CD798B1824Be09a793e4Bec"
const feeDepostController = "0x7E3D2F480AbbA95863040D763DDe8F30D100C6F5"

const abi = {
  addInterest: "event AddInterest(uint256 interestEarned, uint256 rate)",
  redeemed: "event Redeemed(address indexed _caller, uint256 _amount, uint256 _collateralFreed, uint256 _protocolFee, uint256 _debtReduction)",
  splits: "function splits() external view returns (tuple(uint80 insurance, uint80 treasury, uint80 platform))"
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const pairContracts = await options.api.call({ abi: 'address[]:getAllPairAddresses', target: '0x10101010E0C3171D894B71B3400668aF311e7D94' })
  const splits = await options.api.call({ target: feeDepostController, abi: abi.splits })

  const addInterestLogs = (await options.getLogs({ targets: pairContracts as any, eventAbi: abi.addInterest, }))
  const redeemedLogs = (await options.getLogs({ targets: pairContracts as any, eventAbi: abi.redeemed, }))

  addInterestLogs.forEach((log) => dailyFees.add(reUSD, log.interestEarned))
  redeemedLogs.forEach((log) => dailyFees.add(reUSD, log._protocolFee))

  const dailySupplySideRevenue = dailyFees.clone(splits.insurance / 1e4)
  const dailyRevenue = dailyFees.clone((+splits.treasury + +splits.platform) / 1e4)
  const dailyHoldersRevenue = dailyFees.clone(splits.platform / 1e4)
  const dailyProtocolRevenue = dailyFees.clone(splits.treasury / 1e4)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue
  }
}

const methodology = {
  Fees: "Total interest paid by borrowers + redemption fees",
  Revenue: "Protocol's share of interest (treasury + RSUP stakers)",
  ProtocolRevenue: "Treasury's portion of interest",
  HoldersRevenue: "Platform fees distributed to RSUP stakers",
  SupplySideRevenue: "Interest paid to lenders in the insurance pool"
}

const adapters: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2025-03-13',
    },
  },
  methodology,
  version: 2
}

export default adapters;