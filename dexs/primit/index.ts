import { httpGet } from "../../utils/fetchURL";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Primit self-reported daily volume.
//
// Data comes from Primit's own matching engine only (LAB permanent-futures
// market and other native pairs written to Primit's `public.trades` table),
// with market-maker self-trades excluded.
//
// Volume that Primit routes to Orderly Network (BTC/ETH/SOL/etc via
// broker_id=primit) is NOT reported here — that portion is attributed
// separately by DeFiLlama via `factory/orderly.ts` (see PR #8115). The
// two pair sets do not overlap, so no double-counting occurs.
//
// Endpoint is public, unauthenticated, and returns strictly UTC-day totals.
const API = "https://api.primit.io/api/v1/public/stats/daily-volume";

const methodology = {
  Volume:
    "Trading volume settled on Primit's own matching engine (LAB perpetual-futures market and other Primit-native pairs). Excludes market-maker self-trades. Excludes volume routed through Orderly Network (attributed separately via factory/orderly.ts under broker_id=primit; the two pair sets are disjoint, so no double-counting).",
};

interface PrimitVolumeResponse {
  date: string;
  start_of_day_unix: number;
  end_of_day_unix: number;
  total_volume_usd: string;
  trade_count: number;
  scope: string;
}

const fetch = async (options: FetchOptions) => {
  const date = new Date(options.startOfDay * 1000)
    .toISOString()
    .slice(0, 10);
  const res: PrimitVolumeResponse = await httpGet(
    `${API}?date=${date}`,
    { timeout: 15000 }
  );
  return {
    dailyVolume: Number(res.total_volume_usd),
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.AVAX],
  start: "2026-07-01",
  methodology,
};

export default adapter;
