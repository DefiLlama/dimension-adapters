import { CHAIN } from "../../helpers/chains";
import { fraxlendExport } from "../../helpers/fraxlend";

// const adapter: SimpleAdapter = {
//   version: 2,
//   adapter: {
//     ...hyIsolatedExport({
//       [CHAIN.HYPERLIQUID]: {
//         start: '2025-04-08',
//         registry: '0x5aB54F5Ca61ab60E81079c95280AF1Ee864EA3e7',
//       },
//     })
//   }
// }

// export default adapter

// export interface HyIsolatedAdapterExportConfig {
//   start?: IStartTimestamp | number | string;
//   registry: string;
// }
// export function hyIsolatedExport(exportConfig: {[key: string]: HyIsolatedAdapterExportConfig}) {
//   const exportObject: BaseAdapter = {}
//   Object.entries(exportConfig).map(([chain, config]) => {
//     exportObject[chain] = {
//       fetch: (async (options: FetchOptions) => {
//         let dailyFees = options.createBalances()
//         let dailyProtocolRevenue = options.createBalances()
//         let dailySupplySideRevenue = options.createBalances()
//         const feeBucket = {};
//         const pairs = await options.api.call({ target: config.registry, abi: abi['getAllPairAddresses'], chain: options.chain})
        
//         const feePairDataBefore = await options.fromApi.multiCall({
//           abi: abi['previewAddInterest'],
//           calls: pairs.map((pair: Address) => ({ target: pair, chain: options.chain })),
//           permitFailure: true, // incase pair didn't exist yet
//         })
        
//         const feePairDataAfter = await options.toApi.multiCall({
//           abi: abi['previewAddInterest'],
//           calls: pairs.map((pair: Address) => ({ target: pair, chain: options.chain })),
//           permitFailure: true, // incase pair didn't exist yet
//         })

//         const assetPairData = await options.api.multiCall({
//           abi: abi['asset'],
//           calls: pairs.map((pair: Address) => ({ target: pair, chain: options.chain })),
//           permitFailure: true,
//         })
//         const collateralPairData = await options.api.multiCall({
//           abi: abi['collateralContract'],
//           calls: pairs.map((pair: Address) => ({ target: pair, chain: options.chain })),
//           permitFailure: true,
//         })

//         for (let i = 0; i < pairs.length; i++) {
//           if (!assetPairData[i] || !collateralPairData[i]) {
//             continue;
//           }

//           const asset = normalizeAddress(assetPairData[i])
//           const collateral = normalizeAddress(collateralPairData[i])
//           const bucketAsset = feeBucket[asset] || {
//             fees: 0,
//             protocolRevenue: 0,
//             supplySideRevenue: 0,
//           }
//           const bucketCollateral = feeBucket[collateral] || {
//             fees: 0,
//             protocolRevenue: 0,
//             supplySideRevenue: 0,
//           }
//           const feeBefore = feePairDataBefore[i]
//           const feeAfter = feePairDataAfter[i]
          
//           // Calculate fee differences and ensure they are non-negative
//           // Handle cases where values might have been reset or are cumulative
//           const interestBefore = Number(feeBefore ? feeBefore._interestEarned : 0)
//           const interestAfter = Number(feeAfter._interestEarned)
//           const feesBefore = Number(feeBefore ? feeBefore._feesAmount : 0)
//           const feesAfter = Number(feeAfter._feesAmount)
          
//           const interestEarned = interestAfter - interestBefore

//           if (interestEarned > 0) {
//             bucketAsset.fees += interestEarned
//             bucketAsset.supplySideRevenue += interestEarned
//           }

//           const feesEarned = feesAfter - feesBefore
//           if (feesEarned > 0) {
//             bucketAsset.protocolRevenue += feesEarned
//           }

//           const liquidationPairEvents = await options.getLogs({
//             targets: [pairs[i]],
//             eventAbi: abi['LiquidationEvent'],
//             fromBlock: await options.getFromBlock(),
//             toBlock: await options.getToBlock(),
//           })
  
//           if (liquidationPairEvents.length > 0) {
//             for (const event of liquidationPairEvents) {
//               const feesAmount = Number(event[4])
      
//               // count liquidation fees
//               bucketCollateral.fees += feesAmount
      
//               // count liquidation bonus protocol fee as revenue
//               bucketCollateral.protocolRevenue += feesAmount
//             }
//           }

//           feeBucket[asset] = bucketAsset
//           feeBucket[collateral] = bucketCollateral
//         }

//         for (const asset in feeBucket) {
//           const bucket = feeBucket[asset]
//           // Ensure all values are non-negative
//           const fees = Math.max(0, bucket.fees)
//           const protocolRevenue = Math.max(0, bucket.protocolRevenue)
//           const supplySideRevenue = Math.max(0, bucket.supplySideRevenue)
          
//           // Only add non-zero values to avoid unnecessary entries
//           if (fees > 0) {
//             dailyFees.add(asset, fees)
//           }
//           if (protocolRevenue > 0) {
//             dailyProtocolRevenue.add(asset, protocolRevenue)
//           }
//           if (supplySideRevenue > 0) {
//             dailySupplySideRevenue.add(asset, supplySideRevenue)
//           }
//         }

//         return {
//           dailyFees,
//           dailyRevenue: dailyProtocolRevenue,
//           dailyProtocolRevenue,
//           dailySupplySideRevenue,
//         }
//       }),
//       start: config.start,
//     }
//   })
//   return exportObject
// }

export default {
  ...fraxlendExport({
    protocolRevenueRatioFromRevenue: 1,
    registries: {
      [CHAIN.HYPERLIQUID]: '0x5aB54F5Ca61ab60E81079c95280AF1Ee864EA3e7',
    }
  }),
  start: '2025-04-08',
};
