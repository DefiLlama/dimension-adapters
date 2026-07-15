import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const url = `https://app.gensuki.xyz/api/defillama/bridge?chain=${options.chain}`;
  const res = await fetchURL(url);
  const dayData = res.history?.find((h: any) => h.date === options.dateString);

  return {
    dailyTransactionsCount: dayData ? dayData.txCount : 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: {
      start: '2026-07-12',
    },
    [CHAIN.POLYGON]: {
      start: '2026-07-12',
    },
    [CHAIN.BASE]: {
      start: '2026-07-12',
    },
    [CHAIN.SEI]: {
      start: '2026-07-12',
    },
    [CHAIN.APECHAIN]: {
      start: '2026-07-12',
    },
    [CHAIN.ARBITRUM]: {
      start: '2026-07-12',
    },
    [CHAIN.ABSTRACT]: {
      start: '2026-07-12',
    },
    [CHAIN.BSC]: {
      start: '2026-07-12',
    },
    [CHAIN.ETHEREUM]: {
      start: '2026-07-12',
    },
    [CHAIN.ROBINHOOD]: {
      start: '2026-07-12',
    },
  },
};

export default adapter;
