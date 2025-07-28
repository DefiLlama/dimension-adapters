import fetchURL from "../../utils/fetchURL";
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VOLUME_URL = `https://api.tanx.fi/external-aggregator/defillama/volume24/`;

const fetch = async (timestamp: number) => {
  const dailyVolume = (await fetchURL(`${VOLUME_URL}?timestamp=${timestamp}`)).payload.volume;
  return {
    dailyVolume,
    timestamp,
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
