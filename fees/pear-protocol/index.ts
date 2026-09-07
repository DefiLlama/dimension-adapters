import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Pear migrated its trading engine around 2026-05-27. Before that date, all
// fees ran through the legacy endpoint below. From that date onward, fees are
// split across two connectors (Hyperliquid and Lighter) on a new endpoint.
// This is unrelated to the revenue split change below, the two dates just
// happen to be a few months apart.
const MIGRATION_DATE = "2026-05-27";

// How fees are split between the treasury and token holders has changed once.
// Before 2026-01-27: 20% treasury, 80% shared with PEAR stakers directly.
// From 2026-01-27 onward: 30% treasury, 70% used for token buybacks instead.
// Either way, nothing goes to LPs, so total revenue always equals total fees.
const REVENUE_SPLIT_CHANGE_DATE = "2026-01-27T00:00:00.000Z";

interface StatsRow {
  timestamp: number;
  volume: number;
  fees: number;
}

const getRevenueSplit = (options: FetchOptions) => {
  const changeMs = new Date(REVENUE_SPLIT_CHANGE_DATE).getTime();
  const requestMs = options.startTimestamp * 1000;
  if (requestMs < changeMs) {
    return { protocolShare: 0.2, holdersShare: 0.8 };
  }
  return { protocolShare: 0.3, holdersShare: 0.7 };
};

const buildRevenueBalances = (options: FetchOptions, feesUsd: number) => {
  const { protocolShare, holdersShare } = getRevenueSplit(options);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(feesUsd);
  dailyRevenue.addUSDValue(feesUsd); // 100%: ProtocolRevenue + HoldersRevenue, nothing goes to LPs
  dailyProtocolRevenue.addUSDValue(feesUsd * protocolShare);
  dailyHoldersRevenue.addUSDValue(feesUsd * holdersShare);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

// Legacy endpoint, single combined number per day, no connector split.
const fetchLegacy = async (options: FetchOptions) => {
  const url = `https://api.pearprotocol.io/v1/metric?timestamp=${options.endTimestamp}`;
  const response = await fetchURL(url);
  const feesUsd = response.payload.dailyFees;

  return buildRevenueBalances(options, feesUsd);
};

// New endpoint, one connector at a time (hyperliquid or lighter).
const fetchConnectorStats = async (
  connector: "hyperliquid" | "lighter",
  options: FetchOptions
): Promise<StatsRow[]> => {
  const startDate = new Date(options.startTimestamp * 1000).toISOString();
  const endDate = new Date(options.endTimestamp * 1000).toISOString();
  const url =
    `https://pro-gateway.pearprotocol.io/statistics/volume` +
    `?connector=${connector}&resolution=24h&startDate=${startDate}&endDate=${endDate}`;
  const response = await fetchURL(url);
  return response?.data ?? [];
};

// Defensive sum: only counts rows whose timestamp actually falls inside the
// requested window, in case the endpoint ever returns an extra boundary row.
const sumInRange = (
  rows: StatsRow[],
  options: FetchOptions,
  key: "volume" | "fees"
): number => {
  const startMs = options.startTimestamp * 1000;
  const endMs = options.endTimestamp * 1000;
  return rows
    .filter((row) => row.timestamp >= startMs && row.timestamp < endMs)
    .reduce((sum, row) => sum + (row[key] ?? 0), 0);
};

const buildNewFetch = (connector: "hyperliquid" | "lighter") => {
  return async (options: FetchOptions) => {
    const rows = await fetchConnectorStats(connector, options);
    const feesUsd = sumInRange(rows, options, "fees");

    return buildRevenueBalances(options, feesUsd);
  };
};

const adapter: SimpleAdapter = {
  // Kept on version 1: fetchLegacy only supports a single endTimestamp per
  // call (one aggregate per day), it cannot serve an arbitrary timestamp
  // range, so this whole file is called on the fixed one-day-at-a-time
  // schedule that version 1 guarantees.
  version: 1,
  adapter: {
    // Legacy engine, stops being queried once the new engines take over.
    [CHAIN.ARBITRUM]: {
      fetch: fetchLegacy,
      start: "2024-05-08",
      deadFrom: MIGRATION_DATE,
    },
    // New engine, connector 1. TODO confirm this start date is still correct
    // if the legacy cutover date above ever changes.
    [CHAIN.HYPERLIQUID]: {
      fetch: buildNewFetch("hyperliquid"),
      start: MIGRATION_DATE,
    },
    // New engine, connector 2. Confirmed via manual test: earliest real data
    // is 2026-06-02.
    [CHAIN.ZK_LIGHTER]: {
      fetch: buildNewFetch("lighter"),
      start: "2026-06-02",
    },
  },
  methodology: {
    Fees: "Trading fees paid by users. Before 2026-05-27, pulled from Pear's legacy metrics API. From 2026-05-27 onward, pulled from Pear's Hyperliquid and Lighter connectors and summed together.",
    Revenue: "All fees are retained by Pear, split between the protocol treasury and token holders, so revenue equals fees.",
    ProtocolRevenue: "Share of fees paid directly to the Pear Protocol treasury: 20% before 2026-01-27, 30% from that date onward.",
    HoldersRevenue: "Share of fees going to PEAR token holders: 80% before 2026-01-27 (shared directly with stakers), 70% from that date onward (used for token buybacks instead).",
  },
};

export default adapter;