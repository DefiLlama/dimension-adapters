import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Pear migrated its trading engine around 2026-05-27. Before that date, all
// volume ran through the legacy endpoint below. From that date onward, volume
// is split across two connectors (Hyperliquid and Lighter) on a new endpoint.
const MIGRATION_DATE = "2026-05-27";

interface StatsRow {
  timestamp: number;
  volume: number;
  fees: number;
}

// Legacy endpoint, single combined number per day, no connector split.
const fetchLegacy = async (options: FetchOptions) => {
  const url = `https://api.pearprotocol.io/v1/metric?timestamp=${options.endTimestamp}`;
  const response = await fetchURL(url);
  const volumeUsd = response.payload.dailyVolume;

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(volumeUsd);

  return { dailyVolume };
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
    const volumeUsd = sumInRange(rows, options, "volume");

    const dailyVolume = options.createBalances();
    dailyVolume.addUSDValue(volumeUsd);

    return { dailyVolume };
  };
};

const adapter: SimpleAdapter = {
  version: 2,
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
    Volume: "Notional trading volume. Before 2026-05-27, pulled from Pear's legacy metrics API. From 2026-05-27 onward, pulled from Pear's Hyperliquid and Lighter connectors and summed together.",
  },
};

export default adapter;