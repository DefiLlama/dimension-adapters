import { BaseAdapter, FetchOptions, SimpleAdapter } from '../../adapters/types'
import AaveAbis from './abi'
import { CHAIN } from '../chains'

// RPCs that reject eth_getLogs over wide block ranges
const MAX_BLOCK_RANGE: Record<string, number> = {
  [CHAIN.ETHERLINK]: 450, // node.mainnet.etherlink.com caps eth_getLogs at 500 blocks; the sdk pads each chunk by 10 blocks per side
}

export function aaveLiquidationsExport(
  config: { [chain: string]: { pools: string[]; start?: string; excludeTxHashes?: string[] } },
  { pullHourly = true, ...otherRootOptions }: {
    pullHourly?: boolean
    [key: string]: any
  } = {},
): SimpleAdapter {
  const exportObject: BaseAdapter = {}

  Object.entries(config).forEach(([chain, { pools, start, excludeTxHashes = [] }]) => {
    const excludedTxs = new Set(excludeTxHashes.map((txHash) => txHash.toLowerCase()))
    exportObject[chain] = {
      fetch: async (options: FetchOptions) => {
        const dailyCollateralLiquidated = options.createBalances()

        for (const pool of pools) {
          const logs: any[] = await options.getLogs({
            target: pool,
            eventAbi: AaveAbis.LiquidationEvent,
            maxBlockRange: MAX_BLOCK_RANGE[chain],
            onlyArgs: false,
          })
          for (const log of logs) {
            if (excludedTxs.has(log.transactionHash.toLowerCase())) continue
            dailyCollateralLiquidated.add(log.args.collateralAsset, log.args.liquidatedCollateralAmount)
          }
        }

        return { dailyCollateralLiquidated }
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
      CollateralLiquidated: 'Total USD value of collateral seized in LiquidationCall events.',
    },
  } as SimpleAdapter
}
