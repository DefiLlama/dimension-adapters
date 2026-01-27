import fetchURL from '../../utils/fetchURL';
import { FetchV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// Bluefin7K Aggregator temporary use 7k.ag API to get volume data
const URL = 'https://statistic.7k.ag';

const fetch: FetchV2 = async ({ fromTimestamp, toTimestamp }) => {
	const dailyVolume = await fetchURL(
		`${URL}/volume-with-ts?from_timestamp=${fromTimestamp}&to_timestamp=${toTimestamp}`,
	);
	return { dailyVolume };
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.SUI]: {
			fetch,
			start: '2025-06-03',
		},
	},
};

export default adapter;