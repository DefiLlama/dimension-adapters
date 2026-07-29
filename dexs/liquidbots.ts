import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// LiquidBots — automated grid-trading bots on Hyperliquid perps.
// Daily trading volume (filled-order notional the bots executed), from the protocol's
// public stats endpoint (same source/methodology family as the fees adapter).
const STATS_URL = "https://api.liquidbots.xyz/api/v1/stats/volume";

interface VolumeDay {
  date: string; // UTC day, "YYYY-MM-DD"
  volume: number; // filled-order notional that day, in USD
}

const fetch = async (options: FetchOptions) => {
  const res = await httpGet(STATS_URL);
  const row: VolumeDay | undefined = (res?.daily || []).find(
    (d: VolumeDay) => d.date === options.dateString,
  );
  const rawVolume: unknown = row?.volume;
  const volume =
    (typeof rawVolume === "number" || typeof rawVolume === "string") &&
    (typeof rawVolume !== "string" || rawVolume.trim() !== "")
      ? Number(rawVolume)
      : NaN;
  // A negative can't be filled-order notional — reject it alongside missing/non-finite.
  if (!row || !Number.isFinite(volume) || volume < 0)
    throw new Error(`No data found for date: ${options.dateString}`);
  return { dailyVolume: volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2026-02-10', // first day reported by /stats/volume
  methodology: {
    Volume:
      "Total filled-order notional (filled quantity x fill price) executed by LiquidBots' grid/DCA/arbitrage bots on Hyperliquid perps.",
  },
};

export default adapter;
