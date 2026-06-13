import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_URL = "https://production.kyan.sh/api/v1/defillama/overview";
const ONE_DAY = 24 * 60 * 60;

const fetch = async () => {
  const data = await httpGet(API_URL);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - data.timestamp) > ONE_DAY)
    throw new Error("Kyan API data is stale (older than 24h)");

  return {
    dailyActiveUsers: data.activity.unique_traders,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2025-04-25",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
