import { SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getUniV2LogAdapter } from '../../helpers/uniswap'

const adapter: SimpleAdapter = {
	version: 2,
	methodology: {
		Volume: 'Total swap volume',
		Fees: 'Users pay 0.3% per swap.',
		UserFees: 'Users pay 0.3% per swap.',
		Revenue: 'No revenue.',
		SupplySideRevenue: 'All swap fees are distributed to LPs.',
	},
	start: '2024-06-27',
	chains: [CHAIN.FLARE],
	fetch: getUniV2LogAdapter({ factory: '0x16b619B04c961E8f4F06C10B42FDAbb328980A89', userFeesRatio: 1, revenueRatio: 0 }),
}

export default adapter