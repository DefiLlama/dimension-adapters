import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const url = `https://app.gensuki.xyz/api/defillama/swap?chain=${options.chain}`;
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
      start: '2026-02-23',
    },
    [CHAIN.POLYGON]: {
      start: '2026-07-15',
    },
    [CHAIN.BASE]: {
      start: '2026-02-23',
    },
    [CHAIN.SEI]: {
      start: '2026-03-25',
    },
    [CHAIN.APECHAIN]: {
      start: '2026-07-15',
    },
    [CHAIN.ARBITRUM]: {
      start: '2026-07-15',
    },
    [CHAIN.ABSTRACT]: {
      start: '2026-07-15',
    },
    [CHAIN.BSC]: {
      start: '2026-03-16',
    },
    [CHAIN.ETHEREUM]: {
      start: '2026-05-20',
    },
    [CHAIN.ROBINHOOD]: {
      start: '2026-07-15',
    },
  },
};

export default adapter;