import { CHAIN } from "../../helpers/chains";
import type { SimpleAdapter } from "../../adapters/types";
import { BaseAdapter, FetchOptions, IStartTimestamp } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import { normalizeAddress } from "@defillama/sdk/build/util";
import { Address } from "@defillama/sdk/build/types";
import abi from "./abi.json";
import { decodeReserveConfig } from "../../helpers/aave/helper";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...hyIsolatedExport({
      [CHAIN.HYPERLIQUID]: {
        start: '2025-02-20',
        registry: '0x5aB54F5Ca61ab60E81079c95280AF1Ee864EA3e7',
      },
    })
  }
}

export default adapter



export interface HyIsolatedAdapterExportConfig {
  start?: IStartTimestamp | number | string;
  registry: string;
}
export function hyIsolatedExport(exportConfig: {[key: string]: HyIsolatedAdapterExportConfig}) {
  const exportObject: BaseAdapter = {}
  Object.entries(exportConfig).map(([chain, config]) => {
    exportObject[chain] = {
      fetch: (async (options: FetchOptions) => {
        let dailyFees = options.createBalances()
        let dailyProtocolRevenue = options.createBalances()
        let dailySupplySideRevenue = options.createBalances()
        const feeBucket = {};
        const pairs = await options.api.call({ target: config.registry, abi: abi['getAllPairAddresses'], chain: options.chain})
        
        const feePairDataBefore = await options.fromApi.multiCall({
          abi: abi['previewAddInterest'],
          calls: pairs.map((pair: Address) => ({ target: pair, chain: options.chain })),
        })

        const feePairDataAfter = await options.toApi.multiCall({
          abi: abi['previewAddInterest'],
          calls: pairs.map((pair: Address) => ({ target: pair, chain: options.chain })),
        })

        const assetPairData = await options.api.multiCall({
          abi: abi['asset'],
          calls: pairs.map((pair: Address) => ({ target: pair, chain: options.chain })),
        })
        const collateralPairData = await options.api.multiCall({
          abi: abi['collateralContract'],
          calls: pairs.map((pair: Address) => ({ target: pair, chain: options.chain })),
        })

        for (let i = 0; i < pairs.length; i++) {
          const asset = assetPairData[i]
          const collateral = collateralPairData[i]
          const bucketAsset = feeBucket[asset] || {
            fees: 0,
            protocolRevenue: 0,
            supplySideRevenue: 0,
          }
          const bucketCollateral = feeBucket[collateral] || {
            fees: 0,
            protocolRevenue: 0,
            supplySideRevenue: 0,
          }
          const feeBefore = feePairDataBefore[i]
          const feeAfter = feePairDataAfter[i]
          
          // Calculate fee differences and ensure they are non-negative
          const interestEarned = Number(feeAfter._interestEarned) - Number(feeBefore._interestEarned)
          const feesEarned = Number(feeAfter._feesAmount) - Number(feeBefore._feesAmount)

          bucketAsset.fees += Number(interestEarned)
          bucketAsset.protocolRevenue += Number(feesEarned)
          bucketAsset.supplySideRevenue += Number(interestEarned)
          

          const liquidationPairEvents = await options.getLogs({
            targets: [pairs[i]],
            eventAbi: abi['LiquidationEvent'],
            fromBlock: await options.getFromBlock(),
            toBlock: await options.getToBlock(),
          })
  
          if (liquidationPairEvents.length > 0) {
            for (const event of liquidationPairEvents) {
              /**
               * The math calculation for liquidation fees
               * 
               * where:
               * collateralForLiquidator - collateral amount given to liquidator
               * feesAmount - protocol fees from liquidation
               */
        
              const collateralForLiquidator = Number(event[1])
              const feesAmount = Number(event[4])
      
              // protocol fees from liquidation
              const b = collateralForLiquidator
              const b2 = feesAmount
      
              // count liquidation bonus as fees
              bucketCollateral.fees += b
      
              // count liquidation bonus for liquidator as supply side fees
              bucketCollateral.supplySideRevenue += b - b2
      
              // count liquidation bonus protocol fee as revenue
              bucketCollateral.protocolRevenue += Number(b2)
            }
          }

          feeBucket[asset] = bucketAsset
          feeBucket[collateral] = bucketCollateral
        }

        for (const asset in feeBucket) {
          dailyFees.add(asset, feeBucket[asset].fees)
          dailyProtocolRevenue.add(asset, feeBucket[asset].protocolRevenue)
          dailySupplySideRevenue.add(asset, feeBucket[asset].supplySideRevenue)
        }
        for (const collateral in feeBucket) {
          dailyFees.add(collateral, feeBucket[collateral].fees)
          dailyProtocolRevenue.add(collateral, feeBucket[collateral].protocolRevenue)
          dailySupplySideRevenue.add(collateral, feeBucket[collateral].supplySideRevenue)
        }
        console.log(feeBucket)


        return {
          dailyFees,
          dailyRevenue: dailyProtocolRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
        }
      }),
      start: config.start,
    }
  })
  return exportObject
}