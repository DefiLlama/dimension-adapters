import { FetchResult, FetchV2, SimpleAdapter } from '../../adapters/types';
import { queryDune } from '../../helpers/dune';
import { CHAIN } from "../../helpers/chains";

const formatDate = (timestamp: number): string =>
  new Date(timestamp * 1000).toISOString().substring(0, 10);

const fetch: FetchV2 = async (options): Promise<FetchResult> => {
  const { startOfDay } = options;

  const result = await queryDune("3800672", {
    time: formatDate(startOfDay)
  });

  const { daily_volume: dailyVolume, cumulative_volume: totalVolume } = result[0];

  return { dailyVolume, totalVolume, timestamp: startOfDay };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: 1709114400,
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
