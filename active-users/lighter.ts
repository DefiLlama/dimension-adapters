import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const LIGHTER_METRICS_API = "https://mainnet.zklighter.elliot.ai/api/v1/exchangeMetrics";

type LighterMetricPoint = {
  timestamp: number;
  data: number;
};

const fetch = async (options: FetchOptions) => {
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const { results, errors } = await PromisePool.withConcurrency(2)
    .for(["active_account_count", "trade_count"])
    .process(async (task) => {
      const response = await fetchURL(`${LIGHTER_METRICS_API}?period=all&kind=${task}`);
      const row = (response.metrics as LighterMetricPoint[]).find(({ timestamp }) => timestamp === options.startOfDay);
      if (!row) throw new Error(`No Lighter ${task} for ${date}`);
      return { task, data: row.data };
    });

  if (errors.length) throw errors[0];

  const metrics = Object.fromEntries(results.map(({ task, data }) => [task, data]));

  return {
    dailyActiveUsers: metrics.active_account_count,
    dailyTransactionsCount: metrics.trade_count,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ZK_LIGHTER],
  start: "2025-01-17",
};

export default adapter;
