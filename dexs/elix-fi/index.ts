import type {
  Adapter,
  BaseAdapter,
  FetchOptions,
  FetchResultV2,
} from "../../adapters/types";
import { elixfiConfig } from "./config";
import { fetchElixFiMetrics } from "./fetch";


async function fetch({
  chain,
  createBalances,
  fromTimestamp,
  toTimestamp,
}: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const metrics = await fetchElixFiMetrics(chain, fromTimestamp, toTimestamp);
  metrics.forEach((metric) => {
    dailyVolume.add(metric.token, metric.volume);
    dailyFees.add(metric.token, metric.fee);
  });
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    ...Object.entries(elixfiConfig).reduce((acc, [key, config]) => {
      acc[key] = {
        fetch,
        start: config.start,
      };
      return acc;
    }, {} as BaseAdapter),
  },
  methodology: {
    Fees: "Fees are collected by the DAO on the token bought during market orders.",
    TVL: "TVL is the total value promised on elix.fi markets in addition to all non promised value that are in the ALM vaults.",
    DataSource: "Data is sourced from the ponder elix.fi indexer and queried via its readonly sql endpoint.",
  },
};

export default adapter;
