import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const LIGHTER_METRICS_API = "https://mainnet.zklighter.elliot.ai/api/v1/exchangeMetrics";

const fetch = async (options: FetchOptions) => {
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const response = await fetchURL(`${LIGHTER_METRICS_API}?period=all&kind=account_count`);
  const row = response.metrics.find(({ timestamp }: any) => timestamp === options.startOfDay);

  if (!row) throw new Error(`No Lighter account count for ${date}`);

  return {
    dailyNewUsers: row.data,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ZK_LIGHTER],
  start: "2025-01-17",
};

export default adapter;
