import { postURL } from "../utils/fetchURL"
import { FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";

type IUrl = {
  [s: string]: string;
}

const url: IUrl = {
  [CHAIN.SUI]: `https://app.sentio.xyz/api/v1/insights/mmt-finance/clmm-dashboard/query`
}

const options = {
  headers: {
    'Content-Type': 'application/json',
    'api-key': 'sd0mYLVwi9gZx8l0FHryM5pQY5VEbU8RX',
  },
};

const fetch = async ({ startTimestamp, endTimestamp, chain, }: FetchOptions): Promise<FetchResultV2> => {
  const data = {
    timeRange: {
      start: startTimestamp.toString(),
      end: endTimestamp.toString(),
      step: 3600,
    },
    queries: [
      {
        metricsQuery: {
          query: 'SwapInVolumeUsdCounter',
          aggregate: {
            op: 'SUM',
          },
        },
        dataSource: 'METRICS',
      },
    ],
    cachePolicy: {
      noCache: true,
    },
  };
  const res = await postURL(url[chain], data, 3, options);
  const values = res?.results?.[0]?.matrix?.samples?.[0]?.values;
  if (!values || values.length < 2)
    throw new Error('No data found for the given time range');

  let dailyVolume = 0;
  let totalVolume = 0;

  const beginVolume = Number(values[0].value);
  const latestVolume = Number(values[values.length - 1].value);
  dailyVolume = latestVolume - beginVolume;
  totalVolume = latestVolume;

  return {
    dailyVolume: dailyVolume,
    totalVolume: totalVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2025-03-08',
    }
  },
};

export default adapter;