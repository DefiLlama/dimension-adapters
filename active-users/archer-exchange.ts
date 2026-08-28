import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const STATS_URL = "https://api.archer.exchange/v1/stats/dimensions";

const fetch = async (options: FetchOptions) => {
  const { activeUsers, transactions } = await fetchURL(
    `${STATS_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}`
  );

  const dailyActiveUsers = Number(activeUsers);
  const dailyTransactionsCount = Number(transactions);
  if (![dailyActiveUsers, dailyTransactionsCount].every(Number.isFinite)) {
    throw new Error("archer-exchange: invalid user metrics from stats endpoint");
  }

  return { dailyActiveUsers, dailyTransactionsCount };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-23",
};

export default adapter;
