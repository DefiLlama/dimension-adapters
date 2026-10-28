import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const HISTORY_URL = "https://app.hypernova.xyz/api/hypernova.services.analytics.v1.AnalyticsService/GetPublicStatsHistory?connect=v1&encoding=json&message=%7B%22range%22%3A%22PUBLIC_STATS_RANGE_ALL%22%7D";

const LABELS = {
  funded: "Funded Accounts",
  assessment: "Assessment Accounts",
};

const VOLUME_COHORTS: Record<string, string> = {
  funded: LABELS.funded,
  paid_evaluation: LABELS.assessment,
};

type HistoryResponse = {
  partial?: unknown;
  stale?: unknown;
  asOf?: unknown;
  tradingActivity?: { date?: unknown; cohort?: unknown; notionalUsd?: unknown }[];
};

const fetch = async (options: FetchOptions) => {
  const date = options.dateString;
  const data: HistoryResponse = await httpGet(HISTORY_URL, { timeout: 30_000 });
  if (data.partial !== false || data.stale !== false) throw new Error(`Hypernova GetPublicStatsHistory: partial=${data.partial} stale=${data.stale}`);
  if (!((options.startOfDay + 86400) * 1000 <= Date.parse(String(data.asOf)))) throw new Error(`Hypernova tradingActivity: ${date} is not a completed UTC day as of ${data.asOf}`);
  if (!Array.isArray(data.tradingActivity)) throw new Error("Hypernova tradingActivity: expected an array");

  const dailyVolume = options.createBalances();
  for (const [cohort, label] of Object.entries(VOLUME_COHORTS)) {
    const rows = data.tradingActivity.filter((row) => row.date === date && row.cohort === cohort);
    const notionalUsd = rows[0]?.notionalUsd;
    if (rows.length !== 1 || typeof notionalUsd !== "string" || !/^\d+(?:\.\d+)?$/.test(notionalUsd))
      throw new Error(`Hypernova tradingActivity: expected one valid ${cohort} row for ${date}, found ${JSON.stringify(rows)}`);
    dailyVolume.addUSDValue(Number(notionalUsd), label);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-05-01",
  methodology: {
    Volume: "Trading volume on funded and paid assessment accounts.",
  },
  breakdownMethodology: {
    Volume: {
      [LABELS.funded]: "Trading volume on funded accounts.",
      [LABELS.assessment]: "Trading volume on paid assessment accounts.",
    },
  },
};

export default adapter;
