import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const api = 'https://api.deltatrade.ai/api/home/data'

async function fetch(options: FetchOptions) {
  const res = await fetchURL(`${api}?chain=${options.chain}`);
  const { total_24h } = res.data;

  return {
    dailyVolume: total_24h,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.NEAR, CHAIN.SOLANA],
  runAtCurrTime: true,
};

export default adapter;
