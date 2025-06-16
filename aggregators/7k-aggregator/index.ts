import { FetchV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const fetch: FetchV2 = async ({ }) => {
	return { dailyVolume: 0 };
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.SUI]: {
			fetch,
			start: '2025-06-03',
			meta: {
				hallmarks: [[1748908800, 'Introducing Bluefin7K']],
			},
		},
	},
};

export default adapter;
