import { postURL } from "../../utils/fetchURL";
import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date"
import { CHAIN } from "../../helpers/chains";

const fetch = async (_t: number, _: ChainBlocks, {chain, startOfDay}: FetchOptions): Promise<FetchResult> => {
      const unixTimestamp= getTimestampAtStartOfDayUTC(startOfDay)
      const data = await postURL(`https://prewimvk04.execute-api.us-west-1.amazonaws.com/prod/llama`, {timestamp: unixTimestamp, chain:chain}, 10);
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
          start: '2022-09-08',
        },
        [CHAIN.ARBITRUM]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.POLYGON]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.AVAX]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.BSC]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.OPTIMISM]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.BASE]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.SCROLL]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.MANTA]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.TAIKO]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.POLYGON_ZKEVM]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.BLAST]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.METIS]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.FANTOM]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: '2022-09-08',
        },
        [CHAIN.SONIC]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: 1735217146,
        },
        [CHAIN.ERA]: {
          fetch: fetch,
          runAtCurrTime: true,
          start: 1662595200,
        },
      },
    };

export default adapter;
