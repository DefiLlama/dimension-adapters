import fetchURL from '../../utils/fetchURL';
import { FetchV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const fetch: FetchV2 = async ({ startTimestamp, endTimestamp }) => {
	const dailyVolume = await fetchURL(
		`https://sui.apis.scallop.io/statistic/swap/daily-volume?fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`,
	);
	return { dailyVolume: dailyVolume.swapVolume };
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.SUI]: {
			fetch,
			start: '2024-08-05',
		},
	},
};

export default adapter;
