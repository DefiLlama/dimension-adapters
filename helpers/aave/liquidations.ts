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
        const dailyLiquidations = options.createBalances()
        const dailyLiquidationRepaidDebt = options.createBalances()

        for (const pool of pools) {
          const events: any[] = await options.getLogs({
            target: pool,
            eventAbi: AaveAbis.LiquidationEvent,
          })
          for (const e of events) {
            dailyLiquidations.add(e.collateralAsset, e.liquidatedCollateralAmount)
            dailyLiquidationRepaidDebt.add(e.debtAsset, e.debtToCover)
          }
        }

        return { dailyLiquidations, dailyLiquidationRepaidDebt }
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
      Liquidations: 'Total USD value of collateral seized in LiquidationCall events.',
      LiquidationRepaidDebt: 'Total USD value of debt repaid by liquidators.',
    },
  } as SimpleAdapter
}
