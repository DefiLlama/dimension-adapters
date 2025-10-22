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

interface Config {
  supportedProtocols: Array<string>;
}

const configs: Record<string, Config> = {
  [CHAIN.ARBITRUM]: { supportedProtocols: ['ostium', 'gmx', 'gains', 'synfutures']},
  [CHAIN.OPTIMISM]: { supportedProtocols: ['orderly']},
  [CHAIN.HYPERLIQUID]: { supportedProtocols: ['hyperliquid']},
  [CHAIN.BSC]: { supportedProtocols: ['kiloex']},
  [CHAIN.BASE]: { supportedProtocols: ['kiloex']},
}

const prefetch = async (options: FetchOptions): Promise<any> => {
  return await fetchStatistics(options.startOfDay);
}

const fetch = async (_a: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
  const prefetch = options.preFetchedResults;
  const items = prefetch.filter((i: any) => i.network === options.chain);

  let dailyVolume = 0;
  for (const item of items) {
    if (configs[options.chain].supportedProtocols.includes(item.protocol)) {
      dailyVolume += item.dailyVolume;
    }
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
    [CHAIN.OPTIMISM]: {
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
  },
  doublecounted: true,
};

export default adapter;
