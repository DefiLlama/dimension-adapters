import { httpGet } from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";


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
};

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const url = `https://common-service.kyberswap.com/api/v1/aggregator/volume/daily?chainId=${chainToId[options.chain]}&timestamps=${unixTimestamp}`;
  const data = (await httpGet(url, { headers: { 'origin': 'https://common-service.kyberswap.com'}})).data?.volumes?.[0];

  return {
    dailyVolume: data.value,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: 1622544000,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: 1632268800,
    },
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: 1622544000,
    },
    [CHAIN.BSC]: {
      fetch: fetch,
      start: 1622544000,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch,
      start: 1622544000,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch,
      start: 1632268800,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: 1622544000,
    },
    [CHAIN.LINEA]: {
      fetch: fetch,
      start: 1632268800,
    },
    [CHAIN.SCROLL]: {
      fetch: fetch,
      start: 1632268800,
    },
    [CHAIN.ERA]: {
      fetch: fetch,
      start: 1632268800,
    },
  },
};

export default adapter;
