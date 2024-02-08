import fetchURL from "../../utils/fetchURL";
import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VOLUME_URL = `https://api.brine.fi/external-aggregator/defillama/volume24/`;

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
      runAtCurrTime: false,
      start: 1680739200,
    },
  },
};

export default adapter;
