import { gql, request } from "graphql-request";
import { SimpleAdapter, FetchResultV2, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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
 * Governance proposal B (100% of protocol revenue → SPRK buyback/burn) effective
 * date: https://sparkdex.ai/governance/proposal/6a046cbecd38e8c7fea826ee
 * (passed 2026-05-17; counted from 2026-05-18 UTC).
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

/**
 * Pre-BBB protocol share of fees (~treasury). After BBB, the same ratio is only
 * used if a snapshot day lacks an explicit treasury/holders breakdown.
 */
const PROTOCOL_FEE_SHARE = 0.6;

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

interface ITradingStat {
  fundingFeeUsd: string;
  id: string;
}

interface DayMetrics {
  dailyVolume: number;
  dailyUserFees: number;
  dailyFees: number;
  dailyProtocolRevenue: number;
  dailyHoldersRevenue: number;
  dailySupplySideRevenue: number;
}

type GraphDayResponse = {
  volumeStats: IVolumeStat[];
  feeStats: IFeeStat[];
  tradingStats: ITradingStat[];
};

const emptyDay = (): DayMetrics => ({
  dailyVolume: 0,
  dailyUserFees: 0,
  dailyFees: 0,
  dailyProtocolRevenue: 0,
  dailyHoldersRevenue: 0,
  dailySupplySideRevenue: 0,
});

const addDays = (a: DayMetrics, b: DayMetrics): DayMetrics => ({
  dailyVolume: a.dailyVolume + b.dailyVolume,
  dailyUserFees: a.dailyUserFees + b.dailyUserFees,
  dailyFees: a.dailyFees + b.dailyFees,
  dailyProtocolRevenue: a.dailyProtocolRevenue + b.dailyProtocolRevenue,
  dailyHoldersRevenue: a.dailyHoldersRevenue + b.dailyHoldersRevenue,
  dailySupplySideRevenue: a.dailySupplySideRevenue + b.dailySupplySideRevenue,
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
      fundingFeeUsd
    }
  }
`;

/** Pre-BBB (before 2026-05-18): 60% protocol / 40% LPs. */
const attributePreBbb = (
  dailyVolume: number,
  dailyUserFees: number,
  dailyFees: number,
): DayMetrics => {
  const dailyProtocolRevenue = dailyFees * PROTOCOL_FEE_SHARE;
  return {
    dailyVolume,
    dailyUserFees,
    dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: dailyFees - dailyProtocolRevenue,
  };
};

/**
 * Fallback for post-BBB snapshot days without a treasury/holders breakdown:
 * treat the historical ~60% protocol share as HoldersRevenue (BBB).
 */
const attributePostBbbApprox = (
  dailyVolume: number,
  dailyUserFees: number,
  dailyFees: number,
): DayMetrics => {
  const dailyHoldersRevenue = dailyFees * PROTOCOL_FEE_SHARE;
  return {
    dailyVolume,
    dailyUserFees,
    dailyFees,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue: dailyFees - dailyHoldersRevenue,
  };
};

const attributeFromSnapshotRow = (
  todaysTimestamp: number,
  row: Partial<DayMetrics>,
): DayMetrics => {
  const dailyVolume = requireSnapshotMetric(row, "dailyVolume", todaysTimestamp);
  const dailyUserFees = requireSnapshotMetric(row, "dailyUserFees", todaysTimestamp);
  const dailyFees = requireSnapshotMetric(row, "dailyFees", todaysTimestamp);

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

    return {
      dailyVolume,
      dailyUserFees,
      dailyFees,
      dailyProtocolRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
    };
  }

  return todaysTimestamp >= BBB_START
    ? attributePostBbbApprox(dailyVolume, dailyUserFees, dailyFees)
    : attributePreBbb(dailyVolume, dailyUserFees, dailyFees);
};

/**
 * Proposal B / post-BBB: 100% of subgraph treasuryFee → SPRK buyback/burn
 * (HoldersRevenue). Pool + keeper + funding → supply side. Protocol = 0.
 */
const sumTreasuryBbbStats = (response: GraphDayResponse): DayMetrics => {
  let dailyVolumeUSD = BigInt(0);
  let dailyUserFeesUSD = BigInt(0);
  let dailyTreasuryUSD = BigInt(0);
  let dailyPoolAndKeeperUSD = BigInt(0);
  let dailyFundingUSD = BigInt(0);

  for (const vol of response.volumeStats) {
    dailyVolumeUSD += BigInt(vol.volumeUsd);
  }

  for (const fee of response.feeStats) {
    const feeUsd = BigInt(fee.feeUsd);
    const total = BigInt(fee.fee);
    dailyUserFeesUSD += feeUsd;

    if (total === 0n) {
      continue;
    }
    const treasuryUsd = (feeUsd * BigInt(fee.treasuryFee)) / total;
    dailyTreasuryUSD += treasuryUsd;
    dailyPoolAndKeeperUSD += feeUsd - treasuryUsd;
  }

  for (const stat of response.tradingStats) {
    dailyFundingUSD += BigInt(stat.fundingFeeUsd);
  }

  const dailyVolume = Number(dailyVolumeUSD) / 1e18;
  const dailyUserFees = Number(dailyUserFeesUSD) / 1e18;
  const dailyHoldersRevenue = Number(dailyTreasuryUSD) / 1e18;
  const dailySupplySideRevenue =
    (Number(dailyPoolAndKeeperUSD) + Number(dailyFundingUSD)) / 1e18;
  const dailyFees = dailyUserFees + Number(dailyFundingUSD) / 1e18;

  return {
    dailyVolume,
    dailyUserFees,
    dailyFees,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const sumPreBbbStats = (response: GraphDayResponse): DayMetrics => {
  let dailyVolumeUSD = BigInt(0);
  let dailyFeeUSD = BigInt(0);
  let dailyFundingFeeUSD = BigInt(0);

  for (const vol of response.volumeStats) {
    dailyVolumeUSD += BigInt(vol.volumeUsd);
  }
  for (const fee of response.feeStats) {
    dailyFeeUSD += BigInt(fee.feeUsd);
  }
  for (const stat of response.tradingStats) {
    dailyFundingFeeUSD += BigInt(stat.fundingFeeUsd);
  }

  return attributePreBbb(
    Number(dailyVolumeUSD) / 1e18,
    Number(dailyFeeUSD) / 1e18,
    (Number(dailyFeeUSD) + Number(dailyFundingFeeUSD)) / 1e18,
  );
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
  // New Perps launched after BBB_START; always use treasury → BBB.
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
  if (OLD_PERPS_LAST_DAY !== null && todaysTimestamp > OLD_PERPS_LAST_DAY) {
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

  const totals = addDays(oldPerps, newPerps);
  const dailyRevenue = totals.dailyProtocolRevenue + totals.dailyHoldersRevenue;

  return {
    dailyVolume: totals.dailyVolume,
    dailyFees: totals.dailyFees,
    dailyUserFees: totals.dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: totals.dailyProtocolRevenue,
    dailyHoldersRevenue: totals.dailyHoldersRevenue,
    dailySupplySideRevenue: totals.dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Old Perps + New Perps daily perpetual volume (isolated deployments; overlapping days are added). Old Perps from sparkdex-trade while live, then a frozen daily snapshot after the V21 subgraph is retired; New Perps from sparkdex-trade-v2 starting 2026-06-23.",
  Fees:
    "Old Perps + New Perps: user trading fees plus funding fees (summed on overlapping days).",
  UserFees:
    "Old Perps + New Perps: user trading fees only (summed on overlapping days).",
  Revenue:
    "Pre-2026-05-18 (Old Perps): 60% of fees retained as protocol revenue. From 2026-05-18 (governance proposal B): 100% of subgraph treasuryFee used for SPRK buyback/burn (BBB) on both Old Perps and New Perps.",
  ProtocolRevenue:
    "Pre-2026-05-18: 60% of Old Perps fees. From 2026-05-18: 0 — treasury share is fully allocated to BBB (HoldersRevenue).",
  HoldersRevenue:
    "From 2026-05-18 (proposal B): 100% of subgraph treasuryFee on Old Perps and New Perps allocated to SPRK buyback/burn. Before that date: not attributed separately (protocol kept the non-LP share).",
  SupplySideRevenue:
    "Pre-2026-05-18: 40% of Old Perps fees to LPs. From 2026-05-18: poolFee + keeperFee + funding fees to liquidity providers (Old Perps + New Perps).",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.FLARE],
  start: "2025-10-15",
  methodology,
};

export default adapter;
