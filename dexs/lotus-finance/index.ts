import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const LOTUS_BASE = process.env.LOTUS_API_BASE ?? "https://lotus-api.lotusfinance.xyz";
const LOTUS_PATH = "/contract/performance";
const INTERVAL = "1d";

const fetch = async (options: FetchOptions) => {
  const startTimestamp = options.startTimestamp;
  const endTimestamp = options.endTimestamp;
  const dailyVolume = options.createBalances();

  // Fetch data for current day and previous day
  const extendedStartTime = (startTimestamp - 86400) * 1000; // 24 hours before
  const qs = new URLSearchParams({
    startTime: String(extendedStartTime),
    endTime: String(endTimestamp * 1000),
    interval: INTERVAL,
  }).toString();

  const data = await fetchURL(`${LOTUS_BASE}${LOTUS_PATH}?${qs}`);

  let currentRow: any[] | null = null;
  let previousRow: any[] | null = null;

  for (const row of data) {
    if (!Array.isArray(row) || row.length < 5) continue;

    const ts = Number(row[0]) / 1000;

    if (ts >= startTimestamp && ts < endTimestamp) {
      currentRow = row;
    } else if (ts < startTimestamp) {
      previousRow = row;
    }
  }

  if (!currentRow || !previousRow) {
    throw new Error(`lotus api returned no rows for ${options.dateString}`);
  }

  const [, currentTvl, currentCumVolume] = currentRow;
  const [, previousTvl, previousCumVolume] = previousRow;

  const currentCumVolumeUsd = Number(currentCumVolume);
  const previousCumVolumeUsd = Number(previousCumVolume);
  if (!Number.isFinite(currentCumVolumeUsd) || !Number.isFinite(previousCumVolumeUsd) || currentCumVolumeUsd < previousCumVolumeUsd) {
    throw new Error(`lotus api returned an invalid cumulative volume for ${options.dateString}`);
  }

  const dailyVolumeUsd = currentCumVolumeUsd - previousCumVolumeUsd;
  if (dailyVolumeUsd === 0 && currentTvl === previousTvl) {
    throw new Error(`lotus api feed is stale: identical snapshot for consecutive days around ${options.dateString}`);
  }

  dailyVolume.addUSDValue(dailyVolumeUsd);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: "2025-06-28",
};

export default adapter;
