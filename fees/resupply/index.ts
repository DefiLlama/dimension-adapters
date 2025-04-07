import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getConfig } from "../../helpers/cache"

const reUSD = "0x57aB1E0003F623289CD798B1824Be09a793e4Bec"
const feeDepostController = "0x7E3D2F480AbbA95863040D763DDe8F30D100C6F5"

const abi = {
  addInterest: "event AddInterest(uint256 interestEarned, uint256 rate)",
  splits: "function splits() external view returns (tuple(uint80 insurance, uint80 treasury, uint80 platform))"
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()
  const pairContracts = await options.api.call({  abi: 'address[]:getAllPairAddresses', target: '0x10101010E0C3171D894B71B3400668aF311e7D94'})
  const splits = await options.api.call({ target: feeDepostController, abi: abi.splits })

  const treasuryRatio = BigInt(splits.treasury)
  const platformRatio = BigInt(splits.platform)

  const addInterestLogs = (await options.getLogs({
    targets: pairContracts as any,
    eventAbi: abi.addInterest,
    flatten: false
  }))

  addInterestLogs.forEach((logs) => {
    if (!logs.length) return
    let totalFees = 0n
    for (const log of logs) {
      const fees = BigInt(log.interestEarned.toString())
      totalFees += fees
    }
    dailyFees.add(reUSD, totalFees)
    const treasuryFees = (totalFees * treasuryRatio) / 10_000n
    const holdersFees = (totalFees * platformRatio) / 10_000n
    dailyHoldersRevenue.add(reUSD, holdersFees)
    dailyProtocolRevenue.add(reUSD, treasuryFees)
    dailyRevenue.add(reUSD, treasuryFees + holdersFees)
  })

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue
  }

}


const methodology = {
  dailyFees: "Total interest paid by borrowers",
  dailyRevenue: "Protocol's share of interest (treasury + RSUP stakers)",
  dailyProtocolRevenue: "Treasury's portion of interest",
  dailyHoldersRevenue: "Platform fees distributed to RSUP stakers",
  dailySupplySideRevenue: "Interest paid to lenders"
}

const adapters: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2025-03-13',
      meta: {
        methodology
      }
    },
  },

  version: 2
}

export default adapters;