import fetchURL from '../../utils/fetchURL';
import { FetchResult, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const URL = 'https://statistic.7k.ag';

const fetch = async (timestamp: number): Promise<FetchResult> => {
	const dailyVolume = await fetchURL(
		`${URL}/daily-volume-with-ts?timestamp=${timestamp}`,
	);

	return {
		dailyVolume,
		timestamp,
	};
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.SUI]: {
			fetch,
			start: 1719563120,
		},
	},
};

export default adapter;
