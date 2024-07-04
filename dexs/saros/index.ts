import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

import fetchURL from "../../utils/fetchURL"

const endpoints = {
  [CHAIN.SOLANA]: "https://api.saros.finance/info",
};

const graphs = (chain: string) => async (timestamp: number) => {
  let res;
  switch (chain) {
    case CHAIN.SOLANA:
      res = await fetchURL(endpoints[CHAIN.SOLANA]);
    default:
      res = await fetchURL(endpoints[CHAIN.SOLANA]);
  }

  return {
    timestamp,
    dailyVolume: res.volume24h,
    totalVolume: res.totalvolume,
  };
};

// @TODO check and backfill
const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.SOLANA]: {
      fetch: graphs(CHAIN.SOLANA),
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 0,
    },
  },
};
export default adapter;
