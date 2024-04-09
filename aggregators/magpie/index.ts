import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import fetchUrl from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const chainsMap: Record<string, string> = {
  ETHEREUM: CHAIN.ETHEREUM,
  ARBITRUM: CHAIN.ARBITRUM,
  POLYGON: CHAIN.POLYGON,
  AVALANCHE: CHAIN.AVAX,
  BNB: CHAIN.BSC,
  OPTIMISM: CHAIN.OPTIMISM,
  BASE: CHAIN.BASE,
};

type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

export async function _fetchURL(url: string, retries: number = 10) {
  if (!requests[url]) {
    requests[url] = fetchUrl(url, retries)
  }
  return requests[url]
}

const fetch = async (timestamp: number, _: ChainBlocks, {chain}: FetchOptions): Promise<FetchResult> => {
    const unixTimestamp1 = getTimestampAtStartOfDayUTC(timestamp);
    const unixTimestamp2 = getUniqStartOfTodayTimestamp();
    if (unixTimestamp1 < unixTimestamp2) {
      const url = `https://script.google.com/macros/s/AKfycbxqWlzQQzpG-KVGVpVLPafPljYkXejEAJ7TpQc8iBaHuvvu5jx5BnRFYEfQu0pqK5j_-Q/exec?timestamp=${unixTimestamp1.toString()}`;
      const data = await _fetchURL(url, 10);
      const chainData = data.result.rows.find((row: any) => chainsMap[row.chain] === chain);
      if (chainData === undefined) {
        return {
          dailyVolume: 0,
          timestamp: unixTimestamp2,
        };
      } else {
        return {
          dailyVolume: chainData.dailyVolume,
          timestamp: unixTimestamp2,
        };
      }
    } else {
      const url = `https://api.dune.com/api/v1/query/3587739/results?api_key=eyZHAcPUFcAFvMk5sVysebYKeyrp9CK0`;
      const data = await fetchUrl(url, 10);
      const chainData = data.result.rows.find((row: any) => chainsMap[row.chain] === chain);
      if (chainData === undefined) {
        return {
          dailyVolume: 0,
          timestamp: unixTimestamp2,
        };
      } else {
        return {
          dailyVolume: chainData.dailyVolume,
          timestamp: unixTimestamp2,
        };
      }
    }
  };

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1662595200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1662595200,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1662595200,
    },
    [CHAIN.AVAX]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1662595200,
    },
    [CHAIN.BSC]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1662595200,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1662595200,
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1662595200,
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
