import { ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

interface IStats {
  unix_ts: number;
  day: string;
  blockchain: string;
  daily_volume: number;
}

const requests: any = {}


export async function fetchURLWithRetry(url: string, options: FetchOptions) {
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const key = `${url}-${start}`;
  if (!requests[key])
    requests[key] = queryDune("4192496", {
      start: start,
      end: end,
    })
  return requests[key]
}

const fetch: any = async (
  timestamp: number,
  _: ChainBlocks,
  options: FetchOptions
): Promise<FetchResultVolume> => {
  const stats: IStats[] = await fetchURLWithRetry("4192496", options);
  const chainStat = stats.find((stat) => stat.unix_ts === options.startOfDay && stat.blockchain === options.chain);

  return { timestamp, dailyVolume: chainStat?.daily_volume || 0 };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: '2023-05-25' },
    [CHAIN.POLYGON]: { fetch, start: '2023-05-25' },
    [CHAIN.BASE]: { fetch, start: '2024-09-26' },
  },
  isExpensiveAdapter: true,
};

export default adapter;
