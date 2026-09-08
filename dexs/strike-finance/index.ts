import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

// Docs: https://docs.strikefinance.org/api
const DAILY_VOLUMES_ENDPOINT =
  "https://api.strikefinance.org/stat/v1/dashboard/volumes";

// [timestampMs, symbol, usdVolume] — one bucket per UTC day per market,
// single-sided USD notional.
type DailyVolumePoint = [number, string, number | string];

export async function fetch(options: FetchOptions) {
  const { total_volume_daily }: { total_volume_daily: DailyVolumePoint[] } =
    await fetchURL(DAILY_VOLUMES_ENDPOINT);

  const dayStart = options.startOfDay * 1000;
  const dayRows = total_volume_daily.filter(
    ([timestamp]) => Number(timestamp) === dayStart,
  );
  if (!dayRows.length)
    throw new Error(
      `No Strike Finance volume data found for ${options.dateString}`,
    );

  const dailyVolume = dayRows.reduce(
    (sum, [, , volume]) => sum + Number(volume),
    0,
  );

  return { dailyVolume };
}

const methodology = {
  Volume:
    "Single-sided USD notional of fills across all Strike Finance V2 perpetual markets, bucketed by UTC day.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CARDANO],
  // V2 stats history begins 2026-03-20; earlier volume (from 2025-05-16) was
  // recorded by the previous adapter version against the V1 analytics API.
  start: "2026-03-20",
  methodology,
};

export default adapter;
