import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { HUBS, chainConfig, discoverSpokes } from '../../fees/aave-v4'

const abis = {
  getAssetCount: 'uint256:getAssetCount',
  getReserveCount: 'uint256:getReserveCount',
  getReserve: 'function getReserve(uint256) view returns (tuple(address underlying, address hub, uint16 assetId, uint8 decimals, uint24 collateralRisk, uint8 flags, uint32 dynamicConfigKey))',
  LiquidationCall: 'event LiquidationCall(uint256 indexed collateralReserveId, uint256 indexed debtReserveId, address indexed user, address liquidator, bool receiveShares, uint256 debtAmountRestored, uint256 drawnSharesLiquidated, tuple(int256 sharesDelta, int256 offsetRayDelta, uint256 restoredPremiumRay) premiumDelta, uint256 collateralAmountRemoved, uint256 collateralSharesLiquidated, uint256 collateralSharesToLiquidator)',
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  // liquidations happen on the Spokes; find them through the Hubs, same as fees/aave-v4
  const hubs = HUBS[options.chain]
  const assetCounts: number[] = await options.fromApi.multiCall({ abi: abis.getAssetCount, calls: hubs })
  const spokes = await discoverSpokes(options.fromApi, hubs, assetCounts)
  if (!spokes.length) return { dailyCollateralLiquidated }

  const logsBySpoke: any[][] = await options.getLogs({ targets: spokes, eventAbi: abis.LiquidationCall, flatten: false })

  for (const [i, spoke] of spokes.entries()) {
    const logs = logsBySpoke[i]
    if (!logs.length) continue

    const reserveIds = [...new Set(logs.map((log: any) => Number(log.collateralReserveId)))]
    const reserves = await options.api.multiCall({ abi: abis.getReserve, calls: reserveIds.map((id) => ({ target: spoke, params: [id] })) })
    const underlying: Record<number, string> = {}
    reserveIds.forEach((id, j) => { underlying[id] = reserves[j].underlying })

    for (const log of logs) {
      // collateral taken from the borrower, in the collateral reserve's underlying
      dailyCollateralLiquidated.add(underlying[Number(log.collateralReserveId)], log.collateralAmountRemoved)
    }
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    CollateralLiquidated: 'Collateral removed from borrowers in Aave V4 Spoke LiquidationCall events (collateralAmountRemoved), in the collateral reserve underlying.',
  },
}

export default adapter
