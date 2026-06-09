import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Source: public stats series loaded by https://hyperscreener.asxn.xyz/home
const HYPERSCREENER_URL = "https://d2v1fiwobg9w6.cloudfront.net";

const fetch = async (options: FetchOptions) => {
  const usersData = await fetchURL(`${HYPERSCREENER_URL}/daily_unique_users`);
  const tradesData = await fetchURL(`${HYPERSCREENER_URL}/cumulative_trades`);

  const users = usersData.chart_data.find((item: any) => item.time.slice(0, 10) === options.dateString);
  const tradeIndex = tradesData.chart_data.findIndex((item: any) => item.time.slice(0, 10) === options.dateString);

  if (!users) throw new Error(`No Hyperscreener daily_unique_users data found for ${options.dateString}`);
  if (tradeIndex === -1) throw new Error(`No Hyperscreener cumulative_trades data found for ${options.dateString}`);

  const trades = tradesData.chart_data[tradeIndex];
  const previousTrades = tradesData.chart_data[tradeIndex - 1];

  return {
    dailyActiveUsers: users.daily_unique_users,
    dailyTransactionsCount: trades.cumulative - (previousTrades?.cumulative ?? 0),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  protocolType: ProtocolType.PROTOCOL,
  start: "2023-06-13",
};

export default adapter;
