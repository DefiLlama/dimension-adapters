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

  const qs = new URLSearchParams({
    startTime: String(startTimestamp * 1000),
    endTime: String(endTimestamp * 1000),
    interval: INTERVAL,
  }).toString();

  const data = await fetchURL(`${LOTUS_BASE}${LOTUS_PATH}?${qs}`);

  for (const row of data) {
    if (!Array.isArray(row) || row.length < 2) continue;

    const [timeMs, volumeUsd] = row;
    const ts = timeMs / 1000;
    if (ts < startTimestamp || ts >= endTimestamp) continue;
    dailyVolume.addUSDValue(Number(volumeUsd));
  }

  return { dailyVolume }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: "2025-06-28",
};

export default adapter;
