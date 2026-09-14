/**
 * Shared DefiLlama aggregators/grom response guards.
 * Keep in sync with aggregators/grom.ts (imported from there).
 *
 * Fail closed: never coerce false / "" / [] into 0 via Number().
 */

/**
 * @param {unknown} n
 * @param {string} label
 * @returns {number}
 */
export function assertFiniteNonNeg(n, label) {
  if (n === null || n === undefined) {
    throw new Error(`grom aggregator: missing ${label}`);
  }
  if (typeof n === 'boolean' || Array.isArray(n) || (typeof n === 'object')) {
    throw new Error(`grom aggregator: invalid ${label}=${String(n)}`);
  }
  if (typeof n === 'string') {
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
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    throw new Error(`grom aggregator: invalid ${label}=${String(n)}`);
  }
  return n;
}

/**
 * @param {any} data
 * @param {{ chainKey: string, startTimestamp: number, endTimestamp: number }} want
 */
export function assertOkDimensionsResponse(data, want) {
  if (!data || data.ok !== true) {
    throw new Error(
      `grom aggregator: rejected response for ${want.chainKey} [${want.startTimestamp},${want.endTimestamp}): ${data?.code || ''} ${data?.error || 'ok!==true'}`
    );
  }

  if (!data.coverage || data.coverage.status !== 'ready') {
    throw new Error(
      `grom aggregator: coverage not ready for ${want.chainKey}: ${data.coverage?.status || 'missing'}`
    );
  }

  if (typeof data.chainKey !== 'string' || !data.chainKey.trim()) {
    throw new Error(`grom aggregator: missing chainKey for ${want.chainKey}`);
  }
  if (data.chainKey !== want.chainKey) {
    throw new Error(
      `grom aggregator: chainKey mismatch want=${want.chainKey} got=${data.chainKey}`
    );
  }

  if (
    Number(data.startTimestamp) !== Number(want.startTimestamp) ||
    Number(data.endTimestamp) !== Number(want.endTimestamp)
  ) {
    throw new Error(
      `grom aggregator: window mismatch want=[${want.startTimestamp},${want.endTimestamp}) got=[${data.startTimestamp},${data.endTimestamp})`
    );
  }

  const volume = assertFiniteNonNeg(data.dailyVolumeUsd, 'dailyVolumeUsd');
  const fees = assertFiniteNonNeg(data.dailyFeesUsd, 'dailyFeesUsd');
  return { volume, fees };
}
