import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const url = "https://app.gensuki.xyz/api/defillama/gunfun";
  const res = await fetchURL(url);
  const dayData = res.history.find((h: any) => h.date === options.dateString);

  return {
    dailyTransactionsCount: dayData ? dayData.txCount : 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2026-02-07',
    },
  },
};

export default adapter;
