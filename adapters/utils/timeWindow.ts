export type AdapterTimeWindow = {
  startTimestamp: number;
  endTimestamp: number;
  fromTimestamp: number;
  toTimestamp: number;
};

export function getLogStartBlock<T extends number | null | undefined>(snapshotBlock: T): T extends number ? number : T {
  return (snapshotBlock == null ? snapshotBlock : snapshotBlock + 1) as T extends number ? number : T;
}

export function getAdapterTimeWindow(
  endTimestamp: number,
  windowSize: number,
): AdapterTimeWindow {
  if (!Number.isInteger(endTimestamp))
    throw new Error(`endTimestamp must be an integer, got ${endTimestamp}`);
  if (!Number.isInteger(windowSize) || windowSize <= 0)
    throw new Error(`windowSize must be a positive integer, got ${windowSize}`);

  const startTimestamp = endTimestamp - windowSize;

  return {
    startTimestamp,
    endTimestamp,
    fromTimestamp: startTimestamp - 1,
    toTimestamp: endTimestamp - 1,
  };
}
