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

  let currentDayVolume = 0;
  let previousDayVolume = 0;

  for (const row of data) {
    if (!Array.isArray(row) || row.length < 5) continue;

    const [timeMs, totalValueLocked, tradingVolumeUsd, activeVaultCount, totalVaultCount] = row;
    const ts = Number(timeMs) / 1000;
    
    if (ts >= startTimestamp && ts < endTimestamp) {
      currentDayVolume = Number(tradingVolumeUsd);
    } else if (ts < startTimestamp) {
      previousDayVolume = Number(tradingVolumeUsd);
    }
  }

  // Calculate daily volume as difference
  const dailyVolumeUsd = currentDayVolume - previousDayVolume;
  if (dailyVolumeUsd > 0) {
    dailyVolume.addUSDValue(dailyVolumeUsd);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: "2025-06-28",
};

export default adapter;
