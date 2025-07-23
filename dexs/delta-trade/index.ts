import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const api = 'https://api.deltatrade.ai/api/home/data'

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const res = await fetchURL(`${api}?chain=${options.chain}`);
  const { total_24h } = res.data;

  return {
    dailyVolume: total_24h,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    near: {
      fetch,
      runAtCurrTime: true,
    },
    solana: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
