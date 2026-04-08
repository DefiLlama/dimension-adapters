import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { EulerChainConfigs } from '../../fees/euler/config'

// stalls on this chain
const SKIP_CHAINS = new Set<string>([CHAIN.TAC])

const UINT256_MAX = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

const Liquidate = 'event Liquidate(address indexed liquidator, address indexed violator, address collateral, uint256 repayAssets, uint256 yieldBalance)'

const fetch = async (options: FetchOptions) => {
  const dailyLiquidationCollateral = options.createBalances()
  const dailyLiquidationDebtRepaid = options.createBalances()

  const config = EulerChainConfigs[options.chain]
  if (!config) return { dailyLiquidationCollateral, dailyLiquidationDebtRepaid }

  // Get all vaults from the eVault factory
  const vaults: string[] = await options.api.call({
    target: config.eVaultAddress,
    abi: 'function getProxyListSlice(uint256 start, uint256 end) view returns (address[] list)',
    params: [0, UINT256_MAX],
  })

  // Get underlying asset for each vault
  const assets = await options.api.multiCall({
    calls: vaults,
    abi: 'address:asset',
    permitFailure: true,
  })

  const vaultAssetMap: Record<string, string> = {}
  for (let i = 0; i < vaults.length; i++) {
    if (assets[i]) vaultAssetMap[vaults[i].toLowerCase()] = assets[i]
  }

  // Fetch Liquidate events from all vaults
  const allEvents = await Promise.all(
    vaults.map(vault => options.getLogs({ target: vault, eventAbi: Liquidate }))
  )

  const liquidationData: { vault: string; event: any }[] = []
  for (let i = 0; i < vaults.length; i++) {
    for (const event of allEvents[i]) {
      liquidationData.push({ vault: vaults[i], event })
    }
  }

  if (liquidationData.length === 0) return { dailyLiquidationCollateral, dailyLiquidationDebtRepaid }

  // Resolve underlying assets for collateral vaults not in the factory list
  const uniqueCollateralVaults = Array.from(new Set(liquidationData.map(d => d.event.collateral.toLowerCase())))
  const missingVaults = uniqueCollateralVaults.filter(v => !vaultAssetMap[v])
  if (missingVaults.length > 0) {
    const missingAssets = await options.api.multiCall({
      calls: missingVaults,
      abi: 'address:asset',
      permitFailure: true,
    })
    for (let i = 0; i < missingVaults.length; i++) {
      if (missingAssets[i]) vaultAssetMap[missingVaults[i]] = missingAssets[i]
    }
  }

  // Convert collateral vault shares to underlying assets
  const shareConversions = await options.api.multiCall({
    calls: uniqueCollateralVaults.map(v => ({ target: v, params: [String(1e18)] })),
    abi: 'function convertToAssets(uint256 shares) view returns (uint256)',
    permitFailure: true,
  })

  const conversionMap: Record<string, bigint> = {}
  for (let i = 0; i < uniqueCollateralVaults.length; i++) {
    if (shareConversions[i]) {
      conversionMap[uniqueCollateralVaults[i]] = BigInt(shareConversions[i])
    }
  }

  for (const { vault, event } of liquidationData) {
    const debtAsset = vaultAssetMap[vault.toLowerCase()]
    if (debtAsset) {
      dailyLiquidationDebtRepaid.add(debtAsset, event.repayAssets)
    }

    const collateralVault = event.collateral.toLowerCase()
    const collateralAsset = vaultAssetMap[collateralVault]
    if (collateralAsset) {
      const conversion = conversionMap[collateralVault]
      if (conversion) {
        const assetsSeized = (BigInt(event.yieldBalance) * conversion) / BigInt(1e18)
        dailyLiquidationCollateral.add(collateralAsset, assetsSeized)
      }
    }
  }

  return { dailyLiquidationCollateral, dailyLiquidationDebtRepaid }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(EulerChainConfigs)
      .filter(([chain]) => !SKIP_CHAINS.has(chain))
      .map(([chain, { start }]) => [chain, { fetch, start }])
  ),
  methodology: {
    LiquidationCollateral: 'Total USD value of collateral seized in Euler v2 eVault Liquidate events.',
    LiquidationDebtRepaid: 'Total USD value of debt repaid in Euler v2 eVault Liquidate events.',
  },
}

export default adapter
