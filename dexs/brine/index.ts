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
  // Retail trading was switched off on 2026-08-06 while TanX moves to an
  // institution-only platform, and the volume endpoint has answered a literal
  // "0" with status "success" every day since. See DefiLlama/dimension-adapters#8689.
  deadFrom: '2026-08-06',
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-04-06',
    },
  },
};

export default adapter;
