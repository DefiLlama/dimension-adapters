import fetchURL from "../../utils/fetchURL";
import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VOLUME_URL = `https://api.tanx.fi/external-aggregator/defillama/volume24/`;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = (await fetchURL(`${VOLUME_URL}?timestamp=${options.toTimestamp}`)).payload.volume;
  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-04-06',
    },
  },
};

export default adapter;
