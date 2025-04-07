import { CHAIN } from "../helpers/chains"
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types"

/**
 *
 * Securitize manages investment and issues stablecoin BUIDL and BUIDL-I on blockchains
 * These assets generate yields for investors (supply revenue) and Securitize takes an amount of management fees (protocol revenue)
 * 
 * Since there is no official APIs or on-chain contracts to get fees data
 * We track fees by monitor and collect data from Securitize investment reports
 */

const methodology = {
  Fees: 'Total yields are genearted by invested assets.',
  SupplySideRevenue: 'The amount of yields are distibuted to investors.',
  ProtocolRevenue: 'The amount of management fees are charged Securitize Protocol.',
}

// based on latest report on April 2025
// maintainer need to monitor future reports and update the earning APY here
//
// **calculations are based on the Ethereum share class, reflecting a 3.84% - 3.87% yield and 50bps management fee, with the investment period from March 1 to March 31** 
// https://securitize.io/BUIDL-monthly-updates-social
//
const EARNING_APY = 0.03855 // 3.855%
const MANAGEMENT_FEE = 0.005 // 0.5%

const BUIDL = '0x7712c34205737192402172409a8f7ccef8aa2aec'
const BUIDL_I = '0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041'

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  for (const asset of [BUIDL, BUIDL_I]) {
    const totalSupply = await options.api.call({
      target: asset,
      abi: 'uint256:totalSupply',
    })

    // total asset iussed on Ethereum blockchain only
    const totalAssetManagement = Number(totalSupply) / 1e6

    const yearInSecs = 365 * 24 * 60 * 60
    const timespan = Number(options.toApi.timestamp) - Number(options.fromApi.timestamp)
    const totalFees = totalAssetManagement * EARNING_APY * timespan / yearInSecs

    // Securitize charges management fees on % of total assets per year
    const managementFees = totalAssetManagement * MANAGEMENT_FEE * timespan / yearInSecs

    dailyFees.addUSDValue(totalFees)
    dailyFees.addUSDValue(managementFees)
    dailySupplySideRevenue.addUSDValue(totalFees)
    dailyProtocolRevenue.addUSDValue(managementFees)
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      meta: {
        methodology,
      },
      start: '2025-03-01',
    },
  }
}

export default adapter
