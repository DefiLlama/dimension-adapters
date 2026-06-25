import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Source: public stats series loaded by https://hyperscreener.asxn.xyz/home
const HYPERSCREENER_URL = "https://d2v1fiwobg9w6.cloudfront.net";

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(`${HYPERSCREENER_URL}/cumulative_new_users`);
  const users = data.chart_data.find((item: any) => item.time.slice(0, 10) === options.dateString);

  if (!users) throw new Error(`No Hyperscreener cumulative_new_users data found for ${options.dateString}`);

  return {
    dailyNewUsers: users.daily_new_users,
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
