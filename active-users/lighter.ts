import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet, postURL } from "../utils/fetchURL";

const API_URL = "https://blockworks.com/api/studio/dashboard/626/visualization/5670/execution?limit=50000&page=1";
const TOKEN_TERMINAL_API = "https://api.tokenterminal.com/trpc/metrics.postTimeseries";
const TOKEN_TERMINAL_PUBLIC_TOKEN = "c0e5035a-64f6-4d2c-b5f6-ac1d1cb3da2f";

type LighterUserStats = {
  dt: string;
  new_users: number;
  daus: number;
};

type TokenTerminalPoint = {
  timestamp: string;
  value: number | null;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const { results } = await PromisePool.withConcurrency(2)
    .for(["userStats", "tradeStats"])
    .process(async (task) => ({
      task,
      data: task === "userStats"
        ? await httpGet(API_URL)
        : await postURL(
          TOKEN_TERMINAL_API,
          {
            data_ids: ["lighter"],
            metric_ids: ["trade_count"],
            interval: "365d",
            groupBy: "none",
            start: date,
            end: date,
            bridged: true,
          },
          3,
          {
            headers: {
              Authorization: `Bearer ${TOKEN_TERMINAL_PUBLIC_TOKEN}`,
              "x-app-path": "/explorer/projects/lighter/metrics/trade-count",
            },
          },
        ),
    }));

  const userRows = results.find(({ task }) => task === "userStats")?.data?.data as LighterUserStats[] | undefined;
  const userRow = Array.isArray(userRows) ? userRows.find(({ dt }) => dt.startsWith(date)) : undefined;
  if (!userRow) throw new Error(`No Lighter user stats for ${date}`);

  const tradeRows = results.find(({ task }) => task === "tradeStats")?.data?.result?.data?.data as TokenTerminalPoint[] | undefined;
  const tradeRow = Array.isArray(tradeRows) ? tradeRows.find(({ timestamp }) => timestamp.startsWith(date)) : undefined;
  if (!tradeRow || tradeRow.value === null) throw new Error(`No Lighter trade count for ${date}`);

  return {
    dailyActiveUsers: userRow.daus,
    dailyNewUsers: userRow.new_users,
    dailyTransactionsCount: tradeRow.value,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ZK_LIGHTER],
  start: "2025-01-17",
};

export default adapter;
