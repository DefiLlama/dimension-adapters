import fetchURL from '../../utils/fetchURL';
import { FetchV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

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
			start: '2024-06-28',
		},
	},
};

export default adapter;
