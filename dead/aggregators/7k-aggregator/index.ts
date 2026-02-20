import { FetchV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const fetch: FetchV2 = async ({ }) => {
	return { dailyVolume: 0 };
};

const adapter: SimpleAdapter = {
	version: 2,
	deadFrom: '2024-06-03',
	adapter: {
		[CHAIN.SUI]: {
			fetch,
			start: '2024-06-28',
		},
	},
};

export default adapter;
