import { BaseAdapter, FetchOptions, SimpleAdapter } from '../../adapters/types'
import AaveAbis from './abi'

export function aaveLiquidationsExport(
  config: { [chain: string]: { pools: string[]; start?: string } },
  { pullHourly = true, ...otherRootOptions }: {
    pullHourly?: boolean
    [key: string]: any
  } = {},
): SimpleAdapter {
  const exportObject: BaseAdapter = {}

  Object.entries(config).forEach(([chain, { pools, start }]) => {
    exportObject[chain] = {
      fetch: async (options: FetchOptions) => {
        const dailyLiquidationCollateral = options.createBalances()
        const dailyLiquidationDebtRepaid = options.createBalances()

        for (const pool of pools) {
          const events: any[] = await options.getLogs({
            target: pool,
            eventAbi: AaveAbis.LiquidationEvent,
          })
          for (const e of events) {
            dailyLiquidationCollateral.add(e.collateralAsset, e.liquidatedCollateralAmount)
            dailyLiquidationDebtRepaid.add(e.debtAsset, e.debtToCover)
          }
        }

        return { dailyLiquidationCollateral, dailyLiquidationDebtRepaid }
      },
      start,
    }
  })

  return {
    ...otherRootOptions,
    version: 2,
    pullHourly,
    adapter: exportObject,
    methodology: {
      LiquidationCollateral: 'Total USD value of collateral seized in LiquidationCall events.',
      LiquidationDebtRepaid: 'Total USD value of debt repaid by liquidators.',
    },
  } as SimpleAdapter
}
