import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchOphisChainDay, ophisChainConfig } from "../helpers/ophis";

const fetch = async (options: FetchOptions) => {
  const row = await fetchOphisChainDay(options);
  return {
    dailyActiveUsers: row?.users ?? 0,
    dailyTransactionsCount: row?.transactions ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: ophisChainConfig,
};

export default adapter;
