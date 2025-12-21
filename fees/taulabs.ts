import { FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

/**
 * TAU Labs Fee Adapter
 *
 * TAU Labs operates ERC4626 vaults (Plasma Vaults) with varying fee structures per vault:
 * - Management Fee: 0.30% - 0.80% annual (varies by vault)
 * - Performance Fee: 2.00% - 10.00% (varies by vault)
 *
 * Fee tracking:
 * - Management fees: Tracked via ManagementFeeRealized events
 * - Performance fees: Read fee rate from getPerformanceFeeData, apply to vault yield
 * - Yield: Tracked via share price growth (convertToAssets)
 *
 * Note: Uses same decimal-aware calculation pattern as getERC4626VaultsYield helper,
 * but per-vault to apply different performance fee rates.
 */

const vaultConfig: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    '0xb0f56bb0bf13ee05fef8cd2d8df5ffdfcac7a74f', // TAU infiniFi Pointsmax
    '0x6f66b845604dad6e80b2a1472e6cacbbe66a8c40', // TAU Reservoir Pointsmax
    '0x43a32d4f6c582f281c52393f8f9e5ace1d4a1e68', // TAU Yield Bond ETF
    '0xe48cdd5ecec5aa53e630a7b4df12f79067b68dac', // TAU InfiniFi BTC Carry
    '0x63103375659d0aa94e9f35df15be01a3dd1ae9c0', // TAU Lending Optimizer
    '0xc50b2d51fd1e2ac67a9c09eaf63c24ea2465c64b', // TAU InfiniFi ETH Carry
    '0xc2a119ea6de75e4b1451330321cb2474eb8d82d4',
  ],
  [CHAIN.FLOW]: ['0xc52E820d2D6207D18667a97e2c6Ac22eB26E803c'],
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const vaults = vaultConfig[options.chain]
  if (!vaults) {
    return { dailyFees, dailyRevenue, dailySupplySideRevenue }
  }

  // Get performance fee data from each vault (in basis points)
  const performanceFeeData = await options.api.multiCall({
    abi: 'function getPerformanceFeeData() view returns (tuple(address feeAccount, uint16 feeInPercentage))',
    calls: vaults,
    permitFailure: true,
  })

  // Get underlying assets for each vault
  const assets = await options.api.multiCall({
    abi: 'address:asset',
    calls: vaults,
    permitFailure: true,
  })

  // Create vault to asset mapping for management fee events
  const vaultToAsset: Record<string, string> = {}
  for (let i = 0; i < vaults.length; i++) {
    if (assets[i]) {
      vaultToAsset[vaults[i].toLowerCase()] = assets[i]
    }
  }

  // Track management fees via ManagementFeeRealized events
  const managementFeeLogs = await options.getLogs({
    targets: vaults,
    eventAbi:
      'event ManagementFeeRealized(uint256 unrealizedFeeInUnderlying, uint256 unrealizedFeeInShares)',
  })

  for (const log of managementFeeLogs) {
    const vaultAddress = (log.address || '').toLowerCase()
    const asset = vaultToAsset[vaultAddress]
    if (asset && log.unrealizedFeeInUnderlying) {
      const feeAmount = BigInt(log.unrealizedFeeInUnderlying)
      dailyFees.add(asset, feeAmount, METRIC.MANAGEMENT_FEES)
      dailyRevenue.add(asset, feeAmount, METRIC.MANAGEMENT_FEES)
    }
  }

  // Calculate yield per vault using same pattern as getERC4626VaultsYield helper
  // (Can't use helper directly as it aggregates results, but we need per-vault yields
  // to apply different performance fee rates: 2-10% depending on vault)
  const vaultDecimals = await options.api.multiCall({
    abi: 'uint8:decimals',
    calls: vaults,
    permitFailure: true,
  })

  const totalSupplies = await options.api.multiCall({
    abi: 'uint256:totalSupply',
    calls: vaults,
    permitFailure: true,
  })

  // Get share prices at start and end of period (using correct decimals per vault)
  const sharePriceCalls = vaults.map((vault, i) => ({
    target: vault,
    params: [String(10 ** Number(vaultDecimals[i] || 18))],
  }))

  const sharePricesStart = await options.fromApi.multiCall({
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    calls: sharePriceCalls,
    permitFailure: true,
  })

  const sharePricesEnd = await options.toApi.multiCall({
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    calls: sharePriceCalls,
    permitFailure: true,
  })

  // Calculate yield and apply performance fees per vault
  for (let i = 0; i < vaults.length; i++) {
    const asset = assets[i]
    const totalSupply = totalSupplies[i]
    const decimals = vaultDecimals[i]
    const priceStart = sharePricesStart[i]
    const priceEnd = sharePricesEnd[i]
    const perfFeeData = performanceFeeData[i]

    if (!asset || !totalSupply || !decimals || !priceStart || !priceEnd) continue

    // Get performance fee rate in basis points (default 10% = 1000 bps)
    const performanceFeeRateBps = perfFeeData?.feeInPercentage
      ? BigInt(perfFeeData.feeInPercentage)
      : 1000n

    // Calculate yield from share price growth
    const priceGrowth = Number(priceEnd) - Number(priceStart)
    if (priceGrowth > 0) {
      const totalYield = (priceGrowth * Number(totalSupply)) / 10 ** Number(decimals)

      // Performance fee = yield × bps / 10000
      const performanceFee = (totalYield * Number(performanceFeeRateBps)) / 10000
      const supplySideYield = totalYield - performanceFee

      dailyFees.add(asset, supplySideYield, METRIC.ASSETS_YIELDS)
      dailyFees.add(asset, performanceFee, METRIC.PERFORMANCE_FEES)
      dailyRevenue.add(asset, performanceFee, METRIC.PERFORMANCE_FEES)
      dailySupplySideRevenue.add(asset, supplySideYield, METRIC.ASSETS_YIELDS)
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Total yield generated by TAU Labs vaults plus management fees charged on deposited assets.',
  Revenue:
    'Management fees (0.3-0.8% annual) plus performance fees (2-10% of yield) collected by the protocol.',
  ProtocolRevenue: 'All fees go to the TAU Labs protocol and IPOR DAO.',
  SupplySideRevenue: 'Yield distributed to vault depositors after performance fees.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Yield generated by vault strategies for depositors.',
    [METRIC.MANAGEMENT_FEES]: 'Annual management fee charged on assets under management.',
    [METRIC.PERFORMANCE_FEES]: 'Performance fee charged on vault profits (varies by vault).',
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: 'Management fees collected by the protocol.',
    [METRIC.PERFORMANCE_FEES]: 'Performance fees collected by the protocol.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2025-04-09' },
    [CHAIN.FLOW]: { fetch, start: '2025-06-19' },
  },
  methodology,
  breakdownMethodology,
}

export default adapter
