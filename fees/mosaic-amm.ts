import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

async function fetch() {
  const pools = (await fetchURL("https://stats.mosaic.ag/v1/public/pools")).data.pools;

  const dailyFees = pools.reduce(
    (fees: number, pool: any) => fees + pool.stats.fee_24h_usd,
     0,
  );

  return {
    dailyFees,
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
