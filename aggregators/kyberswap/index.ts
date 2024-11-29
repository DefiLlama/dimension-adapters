import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const chainToId: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
  [CHAIN.BSC]: 56,
  [CHAIN.FANTOM]: 250,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.POLYGON]: 137,
  [CHAIN.LINEA]: 59144,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.ERA]: 324,
  [CHAIN.CRONOS]: 25,
  [CHAIN.BASE]: 8453,
  [CHAIN.MANTLE]: 5000,
  [CHAIN.BLAST]: 81457,
  [CHAIN.POLYGON_ZKEVM]: 1101,
  [CHAIN.BITTORRENT]: 199,
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = `https://common-service.kyberswap.com/api/v1/aggregator/volume/daily?chainId=${
    chainToId[options.chain]
  }&timestamps=${options.startOfDay}`;
  const data = (
    await httpGet(url, {
      headers: { origin: "https://common-service.kyberswap.com" },
    })
  ).data?.volumes?.[0];

  return {
    dailyVolume: data.value,
  };
};

const adapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch,
      start: '2021-06-01',
    },
    [CHAIN.MANTLE]: {
      fetch: fetch,
      start: '2021-06-01',
    },
    [CHAIN.BLAST]: {
      fetch: fetch,
      start: '2021-06-01',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: fetch,
      start: '2021-06-01',
    },
    /*[CHAIN.BITTORRENT]: {
      fetch: fetch,
      start: '2021-06-01',
    },*/
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2021-06-01',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2021-09-22',
    },
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: '2021-06-01',
    },
    [CHAIN.BSC]: {
      fetch: fetch,
      start: '2021-06-01',
    },
    [CHAIN.FANTOM]: {
      fetch: fetch,
      start: '2021-06-01',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch,
      start: '2021-09-22',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: '2021-06-01',
    },
    [CHAIN.LINEA]: {
      fetch: fetch,
      start: '2021-09-22',
    },
    [CHAIN.SCROLL]: {
      fetch: fetch,
      start: '2021-09-22',
    },
    [CHAIN.ERA]: {
      fetch: fetch,
      start: '2021-09-22',
    },
  },
};

export default adapter;
