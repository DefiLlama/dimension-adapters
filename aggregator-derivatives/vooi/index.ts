import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import asyncRetry from "async-retry";

async function fetchStatistics(startOfDay: number) {
  const data = await asyncRetry(
    async () => fetchURL(`https://vooi-rebates.fly.dev/defillama/volumes?ts=${startOfDay}`),
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
      factor: 2,
    }
  );
  return data.map((item: any) => ({
    ...item,
    dailyVolume: Number(item.dailyVolume),
  }));
}

const getItems: Record<string, (items: Array<any>) => Array<any>> = {
  [CHAIN.ARBITRUM]: (items: Array<any>): Array<any> => {
    return items.filter(item => ['ostium'].includes(item.protocol) || (['gmx', 'gains', 'synfutures'].includes(item.protocol) && item.network === 'arbitrum'))
  },
  [CHAIN.ORDERLY]: (items: Array<any>): Array<any> => {
    return items.filter(item => item.protocol === 'orderly')
  },
  [CHAIN.HYPERLIQUID]: (items: Array<any>): Array<any> => {
    return items.filter(item => item.protocol === 'hyperliquid')
  },
  [CHAIN.BSC]: (items: Array<any>): Array<any> => {
    return items.filter(item => item.protocol == 'kiloex' && (item.network === 'bnb' || item.network === null))
  },
  [CHAIN.BASE]: (items: Array<any>): Array<any> => {
    return items.filter(item => ['synfutures', 'kiloex'].includes(item.protocol) && item.network === 'base')
  },
  [CHAIN.BLAST]: (items: Array<any>): Array<any> => {
    return items.filter(item => item.protocol == 'kiloex' && item.network === 'blast')
  },
  [CHAIN.TAIKO]: (items: Array<any>): Array<any> => {
    return items.filter(item => item.protocol == 'synfutures' && item.network === 'taiko')
  },
  [CHAIN.MANTA]: (items: Array<any>): Array<any> => {
    return items.filter(item => item.protocol == 'kiloex' && item.network === 'manta')
  },
  [CHAIN.OP_BNB]: (items: Array<any>): Array<any> => {
    return items.filter(item => item.protocol == 'kiloex' && item.network === 'opbnb')
  },
  [CHAIN.OFF_CHAIN]: (items: Array<any>): Array<any> => {
    return items.filter(item => item.protocol == 'aster')
  },
}

const prefetch = async (options: FetchOptions): Promise<any> => {
  return await fetchStatistics(options.startOfDay);
}

const fetch = async (_a: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
  const results = options.preFetchedResults;

  const items = getItems[options.chain](results)

  let dailyVolume = 0;
  for (const item of items) {
    dailyVolume += item.dailyVolume;
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: "2024-05-02",
    },
    [CHAIN.ORDERLY]: {
      start: "2024-05-02",
    },
    [CHAIN.BSC]: {
      start: "2024-06-01",
    },
    [CHAIN.BASE]: {
      start: "2024-08-01",
    },
    [CHAIN.HYPERLIQUID]: {
      start: "2024-11-04",
    },
    [CHAIN.TAIKO]: {
      start: "2025-10-20",
    },
    [CHAIN.MANTA]: {
      start: "2025-10-20",
    },
    [CHAIN.BLAST]: {
      start: "2025-10-20",
    },
    [CHAIN.OP_BNB]: {
      start: "2025-10-20",
    },
    [CHAIN.OFF_CHAIN]: {
      start: '2025-11-01'
    }
  },
  doublecounted: true,
};

export default adapter;
