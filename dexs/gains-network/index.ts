import { ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

interface IStats {
  unix_ts: number;
  day: string;
  blockchain: string;
  daily_volume: number;
}

const fetch: any = async (
  timestamp: number,
  _: ChainBlocks,
  { chain, startOfDay, toTimestamp }: FetchOptions
): Promise<FetchResultVolume> => {
  const stats: IStats[] = await queryDune("4192496", { start: startOfDay, end: toTimestamp });
  const chainStat = stats.find((stat) => stat.unix_ts === startOfDay && stat.blockchain === chain);

  return { timestamp, dailyVolume: chainStat?.daily_volume || 0 };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: 1684972800 },
    [CHAIN.POLYGON]: { fetch, start: 1684972800 },
    [CHAIN.BASE]: { fetch, start: 1727351131 },
  },
};

export default adapter;
