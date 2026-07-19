import { gql, request } from "graphql-request";
import { SimpleAdapter, FetchResultV2, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

// Old Perps (V21) and New Perps (V22) are separate deployments; markets may share
// names but pools/trading are isolated, so overlapping days are summed.
const ENDPOINT_OLD_PERPS =
  "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-trade/latest/gn";
const ENDPOINT_NEW_PERPS =
  "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-trade-v2/latest/gn";

/** First UTC day with New Perps (V22) subgraph daily stats. */
const NEW_PERPS_START = 1782172800; // 2026-06-23

/**
 * From this UTC day, the protocol treasury share of trading fees is used to buy
 * back and burn SPRK (no separate protocol revenue retention).
 */
const BBB_START = 1779062400; // 2026-05-18

/**
 * Frozen Old Perps daily metrics hosted after the V21 subgraph is retired.
 * Plan: publish the day map to this URL, then flip OLD_PERPS_USE_SNAPSHOT so
 * historical refills read the snapshot instead of Goldsky V21.
 */
const OLD_PERPS_SNAPSHOT_URL =
  "https://api.sparkdex.ai/defillama/sparkdex-perps-v21-daily.json";

/**
 * When true, Old Perps metrics come only from OLD_PERPS_SNAPSHOT_URL (throw if
 * the day is missing — never return 0 and overwrite DefiLlama history).
 * Keep false while the Old Perps subgraph is still live.
 */
const OLD_PERPS_USE_SNAPSHOT = false;

/**
 * Inclusive last UTC day that may still carry Old Perps volume. Old Perps fully
 * stops on 2026-07-31 12:00 UTC; until then wind-down days may have no stats.
 * After this day the Old Perps contribution is 0 without reading live subgraph.
 */
const OLD_PERPS_LAST_DAY = 1785456000; // 2026-07-31

/** Pre-BBB protocol share of trading fees (~treasury). */
const PROTOCOL_FEE_SHARE = 0.6;

const KEEPER_FEES = "Keeper Fees";

interface IVolumeStat {
  volumeUsd: string;
  id: string;
}

interface IFeeStat {
  feeUsd: string;
  fee: string;
  poolFee: string;
  keeperFee: string;
  treasuryFee: string;
  id: string;
}

type GraphDayResponse = {
  volumeStats: IVolumeStat[];
  feeStats: IFeeStat[];
  tradingStats: unknown[];
};

interface DayMetrics {
  dailyVolume: number;
  dailyFees: number;
  dailyUserFees: number;
  dailyProtocolRevenue: number;
  dailyHoldersRevenue: number;
  dailySupplySideRevenue: number;
  dailyLpFees: number;
  dailyKeeperFees: number;
}

const emptyDay = (): DayMetrics => ({
  dailyVolume: 0,
  dailyFees: 0,
  dailyUserFees: 0,
  dailyProtocolRevenue: 0,
  dailyHoldersRevenue: 0,
  dailySupplySideRevenue: 0,
  dailyLpFees: 0,
  dailyKeeperFees: 0,
});

const addDays = (a: DayMetrics, b: DayMetrics): DayMetrics => ({
  dailyVolume: a.dailyVolume + b.dailyVolume,
  dailyFees: a.dailyFees + b.dailyFees,
  dailyUserFees: a.dailyUserFees + b.dailyUserFees,
  dailyProtocolRevenue: a.dailyProtocolRevenue + b.dailyProtocolRevenue,
  dailyHoldersRevenue: a.dailyHoldersRevenue + b.dailyHoldersRevenue,
  dailySupplySideRevenue: a.dailySupplySideRevenue + b.dailySupplySideRevenue,
  dailyLpFees: a.dailyLpFees + b.dailyLpFees,
  dailyKeeperFees: a.dailyKeeperFees + b.dailyKeeperFees,
});

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const requireSnapshotMetric = (
  row: Partial<DayMetrics>,
  key: keyof DayMetrics,
  todaysTimestamp: number,
): number => {
  const value = row[key];
  if (!isFiniteNumber(value)) {
    throw new Error(
      `SparkDEX Old Perps snapshot for ${todaysTimestamp} has invalid or missing ${key}`,
    );
  }
  return value;
};

const assertGraphDayResponse = (
  response: unknown,
  deployment: string,
  todaysTimestamp: number,
  options?: { allowEmpty?: boolean },
): GraphDayResponse | null => {
  if (!response || typeof response !== "object") {
    throw new Error(
      `SparkDEX ${deployment}: invalid GraphQL response for ${todaysTimestamp}`,
    );
  }

  const record = response as Record<string, unknown>;
  const keys = ["volumeStats", "feeStats", "tradingStats"] as const;
  for (const key of keys) {
    if (!Array.isArray(record[key])) {
      throw new Error(
        `SparkDEX ${deployment}: missing ${key} for ${todaysTimestamp}`,
      );
    }
  }

  const volumeStats = record.volumeStats as unknown[];
  const feeStats = record.feeStats as unknown[];
  const tradingStats = record.tradingStats as unknown[];
  if (
    volumeStats.length === 0 &&
    feeStats.length === 0 &&
    tradingStats.length === 0
  ) {
    if (options?.allowEmpty) {
      return null;
    }
    throw new Error(
      `SparkDEX ${deployment}: missing daily stats for ${todaysTimestamp}`,
    );
  }

  return response as GraphDayResponse;
};

const graphQuery = (todaysTimestamp: number) => gql`
  query SparkdexPerpsDay {
    volumeStats(where: {timestamp: ${todaysTimestamp}, period: "daily"}) {
      id
      volumeUsd
    }
    feeStats(where: {timestamp: ${todaysTimestamp}, period: "daily"}) {
      id
      feeUsd
      fee
      poolFee
      keeperFee
      treasuryFee
    }
    tradingStats(where: {timestamp: ${todaysTimestamp}, period: "daily"}) {
      id
    }
  }
`;

/** Pre-BBB: 60% protocol / 40% LPs on trading fees. */
const attributePreBbb = (dailyVolume: number, tradingFees: number): DayMetrics => {
  const dailyProtocolRevenue = tradingFees * PROTOCOL_FEE_SHARE;
  const dailyLpFees = tradingFees - dailyProtocolRevenue;
  return {
    dailyVolume,
    dailyFees: tradingFees,
    dailyUserFees: tradingFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: dailyLpFees,
    dailyLpFees,
    dailyKeeperFees: 0,
  };
};

/**
 * Fallback for post-BBB snapshot days without an explicit revenue breakdown:
 * treat the historical ~60% protocol share as HoldersRevenue (BBB).
 */
const attributePostBbbApprox = (
  dailyVolume: number,
  tradingFees: number,
): DayMetrics => {
  const dailyHoldersRevenue = tradingFees * PROTOCOL_FEE_SHARE;
  const dailyLpFees = tradingFees - dailyHoldersRevenue;
  return {
    dailyVolume,
    dailyFees: tradingFees,
    dailyUserFees: tradingFees,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue: dailyLpFees,
    dailyLpFees,
    dailyKeeperFees: 0,
  };
};

const attributeFromSnapshotRow = (
  todaysTimestamp: number,
  row: Partial<DayMetrics>,
): DayMetrics => {
  const dailyVolume = requireSnapshotMetric(row, "dailyVolume", todaysTimestamp);
  const dailyFees = requireSnapshotMetric(row, "dailyFees", todaysTimestamp);
  const dailyUserFees =
    row.dailyUserFees !== undefined
      ? requireSnapshotMetric(row, "dailyUserFees", todaysTimestamp)
      : dailyFees;

  const hasProtocol = row.dailyProtocolRevenue !== undefined;
  const hasHolders = row.dailyHoldersRevenue !== undefined;
  const hasSupply = row.dailySupplySideRevenue !== undefined;
  const anyRevenue = hasProtocol || hasHolders || hasSupply;
  const allRevenue = hasProtocol && hasHolders && hasSupply;

  if (anyRevenue && !allRevenue) {
    throw new Error(
      `SparkDEX Old Perps snapshot for ${todaysTimestamp} has incomplete revenue breakdown`,
    );
  }

  if (allRevenue) {
    const dailyProtocolRevenue = row.dailyProtocolRevenue!;
    const dailyHoldersRevenue = row.dailyHoldersRevenue!;
    const dailySupplySideRevenue = row.dailySupplySideRevenue!;

    if (
      !isFiniteNumber(dailyProtocolRevenue) ||
      !isFiniteNumber(dailyHoldersRevenue) ||
      !isFiniteNumber(dailySupplySideRevenue)
    ) {
      throw new Error(
        `SparkDEX Old Perps snapshot for ${todaysTimestamp} has non-finite revenue breakdown`,
      );
    }

    const dailyLpFees = isFiniteNumber(row.dailyLpFees)
      ? row.dailyLpFees
      : dailySupplySideRevenue;
    const dailyKeeperFees = isFiniteNumber(row.dailyKeeperFees)
      ? row.dailyKeeperFees
      : 0;

    return {
      dailyVolume,
      dailyFees,
      dailyUserFees,
      dailyProtocolRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
      dailyLpFees,
      dailyKeeperFees,
    };
  }

  return todaysTimestamp >= BBB_START
    ? attributePostBbbApprox(dailyVolume, dailyFees)
    : attributePreBbb(dailyVolume, dailyFees);
};

const sumVolume = (response: GraphDayResponse): number => {
  let dailyVolumeUSD = BigInt(0);
  for (const vol of response.volumeStats) {
    dailyVolumeUSD += BigInt(vol.volumeUsd);
  }
  return Number(dailyVolumeUSD) / 1e18;
};

/**
 * Post-BBB: protocol treasury share → SPRK buyback/burn (HoldersRevenue).
 * Pool + keeper shares → supply side.
 */
const sumTreasuryBbbStats = (response: GraphDayResponse): DayMetrics => {
  let tradingFeesUSD = BigInt(0);
  let treasuryUSD = BigInt(0);
  let poolUSD = BigInt(0);
  let keeperUSD = BigInt(0);

  for (const fee of response.feeStats) {
    const feeUsd = BigInt(fee.feeUsd);
    const total = BigInt(fee.fee);
    const poolFee = BigInt(fee.poolFee);
    const keeperFee = BigInt(fee.keeperFee);
    const treasuryFee = BigInt(fee.treasuryFee);
    const components = poolFee + keeperFee + treasuryFee;

    // Skip unattributable / inconsistent rows so feeUsd cannot leak into LP/dust.
    if (total <= 0n || components <= 0n) {
      continue;
    }
    const componentDiff =
      components >= total ? components - total : total - components;
    // Subgraph rows are occasionally off by a few wei; reject only material mismatch.
    if (componentDiff > 1000n && componentDiff * 1_000_000n > total) {
      continue;
    }

    tradingFeesUSD += feeUsd;
    treasuryUSD += (feeUsd * treasuryFee) / total;
    poolUSD += (feeUsd * poolFee) / total;
    keeperUSD += (feeUsd * keeperFee) / total;
  }

  const dailyFees = Number(tradingFeesUSD) / 1e18;
  const dailyHoldersRevenue = Number(treasuryUSD) / 1e18;
  const dailyLpFees = Number(poolUSD) / 1e18;
  const dailyKeeperFees = Number(keeperUSD) / 1e18;
  // Integer-division dust only — counted feeUsd rows are attributed above.
  const attributed = dailyHoldersRevenue + dailyLpFees + dailyKeeperFees;
  const dust = dailyFees - attributed;

  return {
    dailyVolume: sumVolume(response),
    dailyFees,
    dailyUserFees: dailyFees,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue: dailyLpFees + dailyKeeperFees + dust,
    dailyLpFees: dailyLpFees + dust,
    dailyKeeperFees,
  };
};

const sumPreBbbStats = (response: GraphDayResponse): DayMetrics => {
  let tradingFeesUSD = BigInt(0);
  for (const fee of response.feeStats) {
    tradingFeesUSD += BigInt(fee.feeUsd);
  }
  return attributePreBbb(sumVolume(response), Number(tradingFeesUSD) / 1e18);
};

const queryOldPerpsDay = async (todaysTimestamp: number): Promise<DayMetrics> => {
  const raw = await request(ENDPOINT_OLD_PERPS, graphQuery(todaysTimestamp));
  const response = assertGraphDayResponse(raw, "Old Perps", todaysTimestamp, {
    allowEmpty: true,
  });
  if (!response) {
    return emptyDay();
  }
  return todaysTimestamp >= BBB_START
    ? sumTreasuryBbbStats(response)
    : sumPreBbbStats(response);
};

const queryNewPerpsDay = async (todaysTimestamp: number): Promise<DayMetrics> => {
  const raw = await request(ENDPOINT_NEW_PERPS, graphQuery(todaysTimestamp));
  const response = assertGraphDayResponse(raw, "New Perps", todaysTimestamp);
  if (!response) {
    throw new Error(
      `SparkDEX New Perps: missing daily stats for ${todaysTimestamp}`,
    );
  }
  return sumTreasuryBbbStats(response);
};

let snapshotCache: Promise<Record<string, Partial<DayMetrics>>> | null = null;

const loadOldPerpsSnapshot = async (): Promise<Record<string, Partial<DayMetrics>>> => {
  if (!snapshotCache) {
    snapshotCache = fetchURL(OLD_PERPS_SNAPSHOT_URL)
      .then((res) => {
        const days = res?.days ?? res;
        if (!days || typeof days !== "object" || Array.isArray(days)) {
          throw new Error(
            `SparkDEX Old Perps snapshot at ${OLD_PERPS_SNAPSHOT_URL} is missing a day map`,
          );
        }
        return days as Record<string, Partial<DayMetrics>>;
      })
      .catch((err) => {
        snapshotCache = null;
        throw err;
      });
  }
  return snapshotCache;
};

const fetchOldPerpsDay = async (todaysTimestamp: number): Promise<DayMetrics> => {
  if (todaysTimestamp > OLD_PERPS_LAST_DAY) {
    return emptyDay();
  }

  if (OLD_PERPS_USE_SNAPSHOT) {
    const days = await loadOldPerpsSnapshot();
    const row = days[String(todaysTimestamp)];
    if (!row) {
      throw new Error(
        `No SparkDEX Old Perps snapshot for ${todaysTimestamp}; refusing to return 0 so DefiLlama refill cannot overwrite stored history`,
      );
    }
    return attributeFromSnapshotRow(todaysTimestamp, row);
  }

  return queryOldPerpsDay(todaysTimestamp);
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const todaysTimestamp = options.startOfDay;

  const oldPerps = await fetchOldPerpsDay(todaysTimestamp);
  const newPerps =
    todaysTimestamp >= NEW_PERPS_START
      ? await queryNewPerpsDay(todaysTimestamp)
      : emptyDay();

  const metrics = addDays(oldPerps, newPerps);

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(metrics.dailyFees, METRIC.MARGIN_FEES);
  dailyUserFees.addUSDValue(metrics.dailyUserFees, METRIC.MARGIN_FEES);

  if (metrics.dailyProtocolRevenue > 0) {
    dailyProtocolRevenue.addUSDValue(
      metrics.dailyProtocolRevenue,
      METRIC.MARGIN_FEES,
    );
    dailyRevenue.addUSDValue(metrics.dailyProtocolRevenue, METRIC.MARGIN_FEES);
  }

  if (metrics.dailyHoldersRevenue > 0) {
    dailyHoldersRevenue.addUSDValue(
      metrics.dailyHoldersRevenue,
      METRIC.TOKEN_BUY_BACK,
    );
    dailyRevenue.addUSDValue(
      metrics.dailyHoldersRevenue,
      METRIC.TOKEN_BUY_BACK,
    );
  }

  if (metrics.dailyLpFees > 0) {
    dailySupplySideRevenue.addUSDValue(metrics.dailyLpFees, METRIC.LP_FEES);
  }
  if (metrics.dailyKeeperFees > 0) {
    dailySupplySideRevenue.addUSDValue(metrics.dailyKeeperFees, KEEPER_FEES);
  }

  return {
    dailyVolume: metrics.dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Sum of daily perpetual trading volume on Old Perps and New Perps. The two deployments are isolated; overlapping days are added together.",
  Fees:
    "Trading fees paid by perpetual traders on Old Perps and New Perps (summed on overlapping days).",
  UserFees:
    "Same as Fees — trading fees paid by perpetual traders.",
  Revenue:
    "Before 2026-05-18: 60% of trading fees kept by the protocol. From 2026-05-18: the protocol treasury share of trading fees is used to buy back and burn SPRK.",
  ProtocolRevenue:
    "Before 2026-05-18: 60% of trading fees. From 2026-05-18: none — the treasury share goes to SPRK buyback and burn instead.",
  HoldersRevenue:
    "From 2026-05-18: the protocol treasury share of trading fees used to buy back and burn SPRK. Before that date: not reported separately.",
  SupplySideRevenue:
    "Before 2026-05-18: 40% of trading fees to liquidity providers. From 2026-05-18: the LP and keeper shares of trading fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MARGIN_FEES]:
      "Perpetual trading fees paid by traders on Old Perps and New Perps.",
  },
  UserFees: {
    [METRIC.MARGIN_FEES]:
      "Trading fees paid by perpetual traders.",
  },
  Revenue: {
    [METRIC.MARGIN_FEES]:
      "Before 2026-05-18: protocol share of trading fees (60%).",
    [METRIC.TOKEN_BUY_BACK]:
      "From 2026-05-18: treasury share of trading fees used to buy back and burn SPRK.",
  },
  ProtocolRevenue: {
    [METRIC.MARGIN_FEES]:
      "Before 2026-05-18: 60% of trading fees to the protocol. From 2026-05-18: none.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]:
      "From 2026-05-18: treasury share of trading fees used to buy back and burn SPRK.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]:
      "Trading fees distributed to perpetual liquidity providers.",
    [KEEPER_FEES]:
      "Trading fees paid to keepers.",
  },
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.FLARE],
  start: "2025-10-15",
  methodology,
  breakdownMethodology,
};

export default adapter;
