import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const STATS_URL = "https://api.archer.exchange/v1/stats/dimensions";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { activeUsers, newUsers, transactions } = await httpGet(
    `${STATS_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}`
  );

  return {
    dailyActiveUsers: Number(activeUsers),
    dailyNewUsers: Number(newUsers),
    dailyTransactionsCount: Number(transactions),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-23",
};

export default adapter;
