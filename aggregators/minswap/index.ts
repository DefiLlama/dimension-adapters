import fetchURL from '../../utils/fetchURL';
import { FetchV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const URL = 'https://api-mainnet-prod.minswap.org/defillama/v2/aggregator-volume-series';

const fetch: FetchV2 = async ({ fromTimestamp, toTimestamp }) => {
  const res = await fetchURL(
    `${URL}?from_timestamp=${fromTimestamp}&to_timestamp=${toTimestamp}`,
  );
  return { dailyVolume: res.dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2025-05-21',
    },
  },
};

export default adapter;
