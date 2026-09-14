/**
 * Shared fail-closed guards for aggregators/grom.
 * Keep in sync with local GROM unit tests (aggregators/grom-guards.js mirror).
 *
 * Never coerce false / "" / [] into 0 via Number().
 */

export function assertFiniteNonNeg(n: unknown, label: string): number {
  if (n === null || n === undefined) {
    throw new Error(`grom aggregator: missing ${label}`);
  }
  if (typeof n === "boolean" || Array.isArray(n) || (typeof n === "object")) {
    throw new Error(`grom aggregator: invalid ${label}=${String(n)}`);
  }
  if (typeof n === "string") {
    const t = n.trim();
    if (!t || !/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) {
      throw new Error(`grom aggregator: invalid ${label}=${String(n)}`);
    }
    const v = Number(t);
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`grom aggregator: invalid ${label}=${String(n)}`);
    }
    return v;
  }
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new Error(`grom aggregator: invalid ${label}=${String(n)}`);
  }
  return n;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`grom aggregator: invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

export function assertOkDimensionsResponse(
  data: unknown,
  want: { chainKey: string; startTimestamp: number; endTimestamp: number }
): { volume: number; fees: number } {
  const body = asRecord(data, "response");

  if (body.ok !== true) {
    throw new Error(
      `grom aggregator: rejected response for ${want.chainKey} [${want.startTimestamp},${want.endTimestamp}): ${String(body.code || "")} ${String(body.error || "ok!==true")}`
    );
  }

  const coverage = asRecord(body.coverage, "coverage");
  if (coverage.status !== "ready") {
    throw new Error(
      `grom aggregator: coverage not ready for ${want.chainKey}: ${String(coverage.status || "missing")}`
    );
  }

  if (typeof body.chainKey !== "string" || !body.chainKey.trim()) {
    throw new Error(`grom aggregator: missing chainKey for ${want.chainKey}`);
  }
  if (body.chainKey !== want.chainKey) {
    throw new Error(
      `grom aggregator: chainKey mismatch want=${want.chainKey} got=${body.chainKey}`
    );
  }

  if (
    Number(body.startTimestamp) !== Number(want.startTimestamp) ||
    Number(body.endTimestamp) !== Number(want.endTimestamp)
  ) {
    throw new Error(
      `grom aggregator: window mismatch want=[${want.startTimestamp},${want.endTimestamp}) got=[${body.startTimestamp},${body.endTimestamp})`
    );
  }

  const volume = assertFiniteNonNeg(body.dailyVolumeUsd, "dailyVolumeUsd");
  const fees = assertFiniteNonNeg(body.dailyFeesUsd, "dailyFeesUsd");
  return { volume, fees };
}
