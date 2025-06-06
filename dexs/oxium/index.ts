import type {
  Adapter,
  BaseAdapter,
  FetchOptions,
  FetchResultV2,
} from "../../adapters/types";
import { fetchMetrics } from "./fetch";
import { oxiumConfig } from "./config";

async function fetch({
  chain,
  createBalances,
  fromTimestamp,
  toTimestamp,
}: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const metrics = await fetchMetrics(chain, fromTimestamp, toTimestamp);
  metrics.forEach((metric) => {
    dailyVolume.add(metric.token, metric.volume);
    dailyFees.add(metric.token, metric.fee);
  });
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    ...Object.entries(oxiumConfig).reduce((acc, [key, config]) => {
      acc[key] = {
        fetch,
        start: config.start,
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
