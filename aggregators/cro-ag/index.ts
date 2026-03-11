import { CHAIN } from '../../helpers/chains'
import { httpGet } from '../../utils/fetchURL'
import { FetchOptions } from '../../adapters/types'

const fetchVolume = async (options: FetchOptions) => {
	const url = `https://cro.ag/api/volume?start_time=${options.startTimestamp}&end_time=${options.endTimestamp}`
	const res = await httpGet(url)
	return {
		dailyVolume: res.data.vol_in_usd,
	}
}

const adapter: any = {
	version: 2,
	adapter: {
		[CHAIN.SUI]: {
			fetch: fetchVolume,
			start: '2025-03-19',
		},
	},
}

export default adapter
