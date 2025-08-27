import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

// const GRAPH_URL = 'https://api.goldsky.com/api/public/project_cmavyufix18br01tv219kbmxo/subgraphs/hybra-v2/release/gn'

// const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
//     const query = gql`
//         query pairDayDatas{
//               pairDayDatas(where: {date: ${options.startOfDay}}, first: 1000, orderBy: dailyVolumeUSD, orderDirection: desc) {
//                 dailyVolumeUSD

//             }
//         }
//     `

//     const data = await request(GRAPH_URL, query)
//     const dailyVolume = options.createBalances()
//     data.pairDayDatas.forEach((e: any) => {
//         dailyVolume.addUSDValue(Number(e.dailyVolumeUSD))
//     })

//     return {
//         dailyVolume
//     }
// }

const adapter: SimpleAdapter = {
	version: 2,
	methodology: {
		Volume: 'Total swap volume collected from factory 0x9c7397c9C5ecC400992843408D3A283fE9108009',
		Fees: 'Users paid 0.25% per swap for volatile pairs and 0.02% for stable pairs.',
		UserFees: 'Users paid 0.25% per swap for volatile pairs and 0.02% for stable pairs.',
		Revenue: '12% swap fees collected by protocol Treasury.',
		ProtocolRevenue: '12% swap fees collected by protocol Treasury.',
		SupplySideRevenue: '88% swap fees distributed to LPs.',
	},
	start: '2025-05-22',
	chains: [CHAIN.HYPERLIQUID],
	fetch: getUniV2LogAdapter({ factory: '0x9c7397c9C5ecC400992843408D3A283fE9108009', fees: 0.0025, stableFees: 0.0002, userFeesRatio: 1, revenueRatio: 0.12, protocolRevenueRatio: 0.12 }),
}

export default adapter
