import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

export function saveJson(destination: string, value: unknown) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

type Slot = { startTimestamp: number; endTimestamp: number };
export function validateHours(slots: Slot[], expected: Slot[]) {
  const windows = new Map(expected.map(s => [s.startTimestamp, s.endTimestamp]));
  const seen = new Set<number>();
  for (const slot of slots) {
    if (!windows.has(slot.startTimestamp) || windows.get(slot.startTimestamp) !== slot.endTimestamp)
      throw new Error('Invalid cached dividend window');
    if (seen.has(slot.startTimestamp)) throw new Error('Duplicate cached dividend window');
    seen.add(slot.startTimestamp);
  }
  return slots.length === expected.length;
}

export function usd(slot: any, key: string): number | null {
  const value = slot.breakdownByToken?.robinhood?.[key]?.usdTvl;
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid USD valuation');
  return value; // Only an explicit numeric zero confirms a zero USD valuation.
}

export function sumUsd(slots: any[], key: string): number | null {
  let total = 0;
  for (const slot of slots) {
    const value = usd(slot, key);
    if (value === null) return null;
    total += value;
  }
  return total;
}
