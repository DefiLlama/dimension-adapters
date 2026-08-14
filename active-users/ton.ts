import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

const TONSTAT_GRAPHQL = "https://www.tonstat.com/api/graphql";

type MetricPoint = { timestamp: string; value: number };

const QUERY = `
  query DailyStats($period: MetricPeriod!) {
    activeUsers: metrics(name: "countOfActiveWalletsDaily", period: $period, granularity: Daily) {
      ... on MetricMeasurement { timestamp value }
    }
    txns: metrics(name: "countOfTransactions", period: $period, granularity: Daily) {
      ... on MetricMeasurement { timestamp value }
    }
  }
`;

const valueOn = (series: MetricPoint[], date: string, label: string): number => {
  const row = series.find((p) => p.timestamp.slice(0, 10) === date);
  if (!row) throw new Error(`No TON ${label} data for ${date}`);
  return Math.round(Number(row.value));
};

const fetch = async (options: FetchOptions) => {
  const date = options.dateString;

  const json = await postURL(
    TONSTAT_GRAPHQL,
    { query: QUERY, variables: { period: "AllTime" } },
    3,
    { headers: { "Content-Type": "application/json" } },
  );

  if (json.errors || !json.data) {
    throw new Error(`TonStat GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  const { activeUsers, txns } = json.data as {
    activeUsers: MetricPoint[];
    txns: MetricPoint[];
  };

  return {
    dailyActiveUsers: valueOn(activeUsers, date, "activeUsers"),
    dailyTransactionsCount: valueOn(txns, date, "txns"),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TON],
  protocolType: ProtocolType.CHAIN,
  start: "2022-03-01",
};

export default adapter;
