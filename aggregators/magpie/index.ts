import { postURL } from "../../utils/fetchURL";
import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date"
import { CHAIN } from "../../helpers/chains";

const fetch = async (timestamp: number, _: ChainBlocks, {chain}: FetchOptions): Promise<FetchResult> => {
      const unixTimestamp= getTimestampAtStartOfDayUTC(timestamp)
      console.log(chain, unixTimestamp)
      const data = await postURL(`https://nj4rp6s90f.execute-api.us-west-1.amazonaws.com/v1/llama`, {timestamp: unixTimestamp, chain:chain}, 10);
      const chainData = data.result
      if (chainData === undefined ) {
        return {
          dailyVolume: 0,
          timestamp: unixTimestamp,
        };
      } else {
      return {
        dailyVolume: chainData.dailyVolume,
        timestamp: unixTimestamp,
      };
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
        [CHAIN.SCROLL]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: 1662595200,
        },
        [CHAIN.MANTA]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: 1662595200,
        },
        [CHAIN.TAIKO]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: 1662595200,
        },
        [CHAIN.POLYGON_ZKEVM]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: 1662595200,
        },
        [CHAIN.BLAST]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: 1662595200,
        },
        [CHAIN.METIS]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: 1662595200,
        },
        [CHAIN.FANTOM]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: 1662595200,
        },
      },
      isExpensiveAdapter: true,
    };

export default adapter;
