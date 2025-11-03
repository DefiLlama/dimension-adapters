import fetchURL from "../utils/fetchURL";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (_: number): Promise<FetchResultFees> => {
  const pools = (await fetchURL("https://api.dipcoin.io/api/pools"))?.data;

  let spotFees = 0;
  for (const pool of pools) {
    spotFees += Number(pool.fee24h);
  }

  return {
    dailyFees: spotFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-05-20",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
