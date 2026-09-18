import { managedVaults } from "./deployments";

export const DAY = 86_400;
export const START = Date.parse("2026-09-11T00:00:00Z") / 1000;
export type VaultFees = {
  vault: string;
  position: string | null;
  harvested: [string, string];
  pending: [string, string];
};
export type Boundary = {
  timestamp: number;
  blockNumber: number;
  blockTimestamp: number;
  blockHash: string;
  nextBlockTimestamp: number;
  vaults: VaultFees[];
};
const address = /^0x[0-9a-fA-F]{40}$/;
const uint = /^(0|[1-9][0-9]{0,77})$/;
const positiveInteger = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
export function dayTimestamp(date: unknown): number {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Invalid fee date");
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date || ms / 1000 < START)
    throw Error("Invalid fee date");
  return ms / 1000;
}

// Reconstruct an explicit public schema; never serialize arbitrary database fields.
export function validateBoundary(input: unknown, timestamp: number): Boundary {
  const b = input as Boundary | undefined;
  if (!b || !positiveInteger(timestamp) || timestamp % DAY || b.timestamp !== timestamp ||
      !positiveInteger(b.blockNumber) || !positiveInteger(b.blockTimestamp) ||
      !positiveInteger(b.nextBlockTimestamp) || b.blockTimestamp >= timestamp ||
      b.nextBlockTimestamp < timestamp || !/^0x[0-9a-fA-F]{64}$/.test(b.blockHash) ||
      !Array.isArray(b.vaults) || b.vaults.length !== managedVaults.length)
    throw Error("Invalid fee boundary");
  const rows = new Map(b.vaults.map(row => [String(row.vault).toLowerCase(), row]));
  if (rows.size !== managedVaults.length) throw Error("Invalid fee vault coverage");
  const vaults = managedVaults.map(v => {
    const row = rows.get(v.vault.toLowerCase());
    if (!row) throw Error("Invalid fee vault coverage");
    for (const pair of [row.harvested, row.pending]) {
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some(n => typeof n !== "string" || !uint.test(n) || BigInt(n) >= 2n ** 256n))
        throw Error("Invalid fee counter");
    }
    if (b.blockNumber < v.deploymentBlock) {
      if (row.position !== null || [...row.harvested, ...row.pending].some(n => n !== "0"))
        throw Error("Invalid predeployment fee counter");
    } else if (typeof row.position !== "string" || !address.test(row.position) || /^0x0{40}$/.test(row.position)) {
      throw Error("Invalid fee position");
    }
    return { vault: v.vault, position: row.position, harvested: [...row.harvested] as [string, string], pending: [...row.pending] as [string, string] };
  });
  return { timestamp, blockNumber: b.blockNumber, blockTimestamp: b.blockTimestamp,
    blockHash: b.blockHash, nextBlockTimestamp: b.nextBlockTimestamp, vaults };
}

export function dailyResponse(date: string, opening: unknown, closing: unknown) {
  const start = dayTimestamp(date);
  const from = validateBoundary(opening, start), to = validateBoundary(closing, start + DAY);
  if (to.blockNumber < from.blockNumber || (to.blockNumber === from.blockNumber && to.blockHash !== from.blockHash))
    throw Error("Invalid fee block order");
  for (let i = 0; i < managedVaults.length; i++) {
    for (const side of [0, 1] as const) {
      // Harvest/recovery may move pending fees into the cumulative counter, which never decreases.
      if (BigInt(to.vaults[i]!.harvested[side]) < BigInt(from.vaults[i]!.harvested[side]))
        throw Error("Fee counter decreased");
    }
  }
  return { version: 1, chain: "robinhood", date, opening: from, closing: to };
}
