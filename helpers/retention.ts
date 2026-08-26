import type { FetchOptions, FetchResultRetention, SimpleAdapter } from "../adapters/types";

const DAY = 86400;
const FIRST_HORIZON_WEEKS = 4;

export interface RetentionDuneSqlSource {
  id: string;
  type: "duneSql";
  /** Raw read-only SQL. The backend replaces the two required day tokens. */
  sql: string;
  output: {
    day: string;
    wallet: string;
    volumeUsd: string;
  };
}

export interface RetentionEvmStaticTargets {
  type: "static";
  addresses: string[];
}

export interface RetentionAccessControlRoleMember {
  role: string;
  member: string;
}

export interface RetentionAccessControlRoleChange
  extends RetentionAccessControlRoleMember {
  blockNumber: number;
  logIndex: number;
  isGrant: boolean;
}

export interface RetentionAccessControlHistory {
  /** Day whose start corresponds to activeAtStart. */
  startDay: string;
  /** First day whose registry events must be queried live by the backend. */
  liveFromDay: string;
  activeAtStart: RetentionAccessControlRoleMember[];
  changesBeforeLive: RetentionAccessControlRoleChange[];
}

export interface RetentionEvmAccessControlTargets {
  type: "accessControlRegistry";
  address: string;
  roles: string[];
  grantedTopic0: string;
  revokedTopic0: string;
  history: RetentionAccessControlHistory;
}

export type RetentionEvmTargets =
  | RetentionEvmStaticTargets
  | RetentionEvmAccessControlTargets;

export interface RetentionEvmEventField {
  type: "address" | "bytes32" | "uint256";
  topic?: number;
  dataWord?: number;
}

export interface RetentionEvmEventSource {
  id: string;
  type: "evmEvents";
  targets: RetentionEvmTargets;
  event: {
    /** Human-readable ABI for reviewers; topic0 is the RPC filter. */
    abi: string;
    topic0: string;
    fields: Record<string, RetentionEvmEventField>;
  };
  where?: Array<{ field: string; equals: string }>;
  output: {
    wallet: string;
    volumeUsd: { field: string; decimals: number };
  };
}

export type RetentionSource = RetentionDuneSqlSource | RetentionEvmEventSource;

export interface RetentionManifest {
  project: string;
  chain: string;
  stateVersion: number;
  observationStart: string;
  firstCohortStart: string;
  /** Delay after a UTC day ends before its source data is safe to index. */
  dataAvailabilityLagHours: number;
  maxQueryDays?: number;
  methodology: string;
  sources: RetentionSource[];
}

/**
 * Validates manifest dates, numeric bounds, and source IDs.
 * @returns The validated manifest unchanged.
 */
export function defineRetentionManifest(
  manifest: RetentionManifest,
): RetentionManifest {
  validateDate(manifest.project, "observationStart", manifest.observationStart);
  validateDate(manifest.project, "firstCohortStart", manifest.firstCohortStart);
  if (manifest.firstCohortStart < manifest.observationStart) {
    throw new Error(`${manifest.project}: firstCohortStart precedes observationStart`);
  }
  if (
    !Number.isFinite(manifest.dataAvailabilityLagHours) ||
    manifest.dataAvailabilityLagHours < 0
  ) {
    throw new Error(
      `${manifest.project}: dataAvailabilityLagHours must be a non-negative number`,
    );
  }
  if (!Number.isInteger(manifest.stateVersion) || manifest.stateVersion < 1) {
    throw new Error(`${manifest.project}: stateVersion must be a positive integer`);
  }
  if (
    manifest.maxQueryDays !== undefined &&
    (!Number.isInteger(manifest.maxQueryDays) || manifest.maxQueryDays < 1)
  ) {
    throw new Error(`${manifest.project}: maxQueryDays must be a positive integer`);
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error(`${manifest.project}: sources must be a non-empty array`);
  }
  const sourceIds = new Set<string>();
  for (const source of manifest.sources) {
    if (!source.id || sourceIds.has(source.id)) {
      throw new Error(`${manifest.project}: source ids must be non-empty and unique`);
    }
    sourceIds.add(source.id);
  }
  return manifest;
}

/** Creates the normal DefiLlama adapter. Its fetch is a read-only state-service call. */
export function createRetentionFetchAdapter(
  manifest: RetentionManifest,
): SimpleAdapter {
  const start = addDays(
    manifest.firstCohortStart,
    FIRST_HORIZON_WEEKS * 7 + 6,
  );

  return {
    version: 1,
    chains: [manifest.chain],
    start,
    methodology: manifest.methodology,
    fetch: (options: FetchOptions) => fetchRetentionMetrics(manifest, options),
  };
}

async function fetchRetentionMetrics(
  manifest: RetentionManifest,
  options: FetchOptions,
): Promise<FetchResultRetention> {
  const baseUrl = process.env.RETENTION_API_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("RETENTION_API_URL is required to fetch retention metrics");
  }

  const url = new URL(
    `${baseUrl}/v1/retention/${encodeURIComponent(manifest.project)}/${options.dateString}`,
  );
  url.searchParams.set("stateVersion", String(manifest.stateVersion));
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${manifest.project}: retention backend returned ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const result = JSON.parse(body) as FetchResultRetention;
  validateMetrics(manifest.project, result);
  return result;
}

function validateMetrics(project: string, result: FetchResultRetention): void {
  if (!result || typeof result !== "object") {
    throw new Error(`${project}: retention backend returned a non-object result`);
  }
  const w4Keys = [
    "dailyRetentionW4CohortWallets",
    "dailyRetentionW4ReturnedWallets",
    "dailyRetentionW4CohortVolume",
    "dailyRetentionW4ReturnedVolume",
  ] as const;
  const w12Keys = [
    "dailyRetentionW12CohortWallets",
    "dailyRetentionW12ReturnedWallets",
    "dailyRetentionW12CohortVolume",
    "dailyRetentionW12ReturnedVolume",
  ] as const;
  for (const key of w4Keys) {
    const value = result[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${project}: retention backend returned invalid ${key}`);
    }
  }
  const presentW12Keys = w12Keys.filter((key) => result[key] !== undefined);
  if (presentW12Keys.length !== 0 && presentW12Keys.length !== w12Keys.length) {
    throw new Error(`${project}: retention backend returned a partial W12 result`);
  }
  for (const key of presentW12Keys) {
    const value = result[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${project}: retention backend returned invalid ${key}`);
    }
  }
}

function validateDate(project: string, field: string, value: string): void {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error(`${project}: invalid ${field} ${value}`);
  }
}

function addDays(value: string, days: number): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY * 1000)
    .toISOString()
    .slice(0, 10);
}
