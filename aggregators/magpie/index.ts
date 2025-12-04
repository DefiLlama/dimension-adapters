import { postURL } from "../../utils/fetchURL";
import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date"
import { CHAIN } from "../../helpers/chains";

const fetch = async (_t: number, _: ChainBlocks, { chain, startOfDay }: FetchOptions): Promise<FetchResult> => {
  const unixTimestamp = getTimestampAtStartOfDayUTC(startOfDay)
  const data = await postURL(`https://prewimvk04.execute-api.us-west-1.amazonaws.com/prod/llama`, { timestamp: unixTimestamp, chain: chain }, 10);
  const chainData = data.result
  if (chainData === undefined) {
    return {
      dailyVolume: 0,
    };
  } else {
    return {
      dailyVolume: chainData.dailyVolume,
    };
  }
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.SCROLL]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.MANTA]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.TAIKO]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch,
      start: '2022-09-08',
    },
    // [CHAIN.BLAST]: {
    //   fetch,
    //   start: '2022-09-08',
    // },
    [CHAIN.METIS]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.FANTOM]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.SONIC]: {
      fetch,
      start: '2024-12-26',
    },
    [CHAIN.ERA]: {
      fetch,
      start: '2022-09-08',
    },
    [CHAIN.BERACHAIN]: {
      fetch,
      start: '2025-02-10',
    },
    [CHAIN.LINEA]: {
      fetch,
      start: '2025-02-11',
    },
    [CHAIN.INK]: {
      fetch,
      start: '2025-02-11',
    },    
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.UNICHAIN]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-10-01',
    },
    [CHAIN.PLASMA]: {
      fetch,
      start: '2025-10-01',
    },
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-11-15',
    },
    [CHAIN.MONAD]: {
      fetch,
      start: '2025-11-22',
    },
  },
};

export default adapter;
