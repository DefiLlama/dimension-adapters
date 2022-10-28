import { SimpleAdapter } from "../../adapters/types";

import fetchURL from "../../utils/fetchURL"

const endpoints = {
  solana: "https://api.saros.finance/info",
};

const graphs = (chain: string) => async () => {
  let res;
  switch (chain) {
    case "solana":
      res = await fetchURL(endpoints.solana);
    default:
      res = await fetchURL(endpoints.solana);
  }

  return {
    timestamp: 1, // fix
    dailyVolume: res.data.volume24h,
    totalVolume: res.data.totalvolume,
  };
};

// @TODO check and backfill
const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch: graphs("solana"),
      runAtCurrTime: true,
      customBackfill: undefined,
      start: async () => 0,
    },
  },
};
export default adapter;
