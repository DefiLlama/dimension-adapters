import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

// const GRAPH_URL = 'https://api.goldsky.com/api/public/project_cmbj707z4cd9901sib1f6cu0c/subgraphs/hybra-v3/v3/gn'

// const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
//     const endTimestamp = options.endTimestamp
//     const startTimestamp = options.startTimestamp // 24 hours in seconds
    
//     let allData: any[] = []
//     let skip = 0
//     const batchSize = 1000
    
//     while (true) {
//         const query = gql`
//             query poolHourDatas($skip: Int!, $periodStartUnix: Int!, $periodEndUnix: Int!) {
//                 poolHourDatas(
//                     first: ${batchSize},
//                     skip: $skip,
//                     where: { periodStartUnix_gte: $periodStartUnix, periodStartUnix_lte: $periodEndUnix },
//                     orderBy: periodStartUnix,
//                     orderDirection: desc
//                 ) {
//                     periodStartUnix
//                     volumeUSD
//                     feesUSD
//                 }
//             }
//         `
        
//         const data = await request(GRAPH_URL, query, {
//             skip,
//             periodStartUnix: startTimestamp,
//             periodEndUnix: endTimestamp
//         })
        
//         if (!data.poolHourDatas || data.poolHourDatas.length === 0) {
//             break
//         }
        
//         // Filter to only include data within the 24-hour window
//         const filteredData = data.poolHourDatas.filter((item: any) => 
//             item.periodStartUnix >= startTimestamp && item.periodStartUnix < endTimestamp
//         )
        
//         allData = allData.concat(filteredData)
        
//         // If we got less than batchSize or all data is before our time window, we're done
//         if (data.poolHourDatas.length < batchSize || 
//             data.poolHourDatas[data.poolHourDatas.length - 1].periodStartUnix >= endTimestamp) {
//             break
//         }
        
//         skip += batchSize
//     }
    
//     const dailyVolume = options.createBalances()
//     const dailyFees = options.createBalances()
    
//     allData.forEach((e: any) => {
//         dailyVolume.addUSDValue(Number(e.volumeUSD))
//         dailyFees.addUSDValue(Number(e.feesUSD))
//     })

//     const dailyUserFees = dailyFees.clone(0.75)
//     const dailyProtocolRevenue = dailyFees.clone(0.25)
//     return {
//         dailyVolume,
//         dailyFees,
//         dailyUserFees,
//         dailyProtocolRevenue,
//     }
// }

const adapter: SimpleAdapter = {
	version: 2,
	methodology: {
		Volume: 'Total swap volume collected from factory 0x2dC0Ec0F0db8bAF250eCccF268D7dFbF59346E5E',
		Fees: 'Users paid 0.02%, 0.25% or 1% per swap.',
		UserFees: 'Users paid 0.02%, 0.25% or 1% per swap.',
		Revenue: '25% swap fees collected by protocol Treasury.',
		ProtocolRevenue: '25% swap fees collected by protocol Treasury.',
		SupplySideRevenue: '75% swap fees distributed to LPs.',
	},
	start: '2025-06-23',
	chains: [CHAIN.HYPERLIQUID],
	fetch: getUniV3LogAdapter({ factory: '0x2dC0Ec0F0db8bAF250eCccF268D7dFbF59346E5E', userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 }),
}

export default adapter
