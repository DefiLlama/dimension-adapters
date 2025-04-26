import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

async function fetch(_: any, _1: any, { startOfDay }: FetchOptions) {
  const pools = (await fetchURL("https://stats.mosaic.ag/v1/public/pools")).data.pools;

  const dailyVolume = pools.reduce(
    (volume: number, pool: any) => volume + pool.stats.volume_24h_usd,
     0,
  );

  return {
    dailyVolume: dailyVolume,
    timestamp: startOfDay,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MOVE]: {
      fetch,
    },
  },
};

export default adapter;
