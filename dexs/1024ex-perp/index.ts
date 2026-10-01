import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// 1024ex is an off-chain matching engine with on-chain settlement via an SVM
// bridge — the same integration model as Hyperliquid and aevo: DefiLlama reads
// the exchange's own public analytics API rather than the chain directly.
//
// Backing endpoints (already live on `main`, `public-api` crate, tag "Analytics"):
//   GET /api/v1/analytics/volume/history?market_type=perp&from=<sec>&to=<sec>
//   GET /api/v1/analytics/fees/history?market_type=perp&from=<sec>&to=<sec>
// Envelope: { success, data: { data: [ {date:"YYYY-MM-DD", ...}, ... ] }, meta }
const API = "https://api-mainnet.1024ex.com/api/v1/analytics";

const methodology = {
  Volume:
    "Total USD notional of every perpetual-futures fill matched on 1024ex, taken from the exchange's per-UTC-day settled-trade rollup (each fill counted once).",
  Fees:
    "All perpetual trading fees paid by users for the day (taker + maker, net of maker rebates).",
  UserFees: "Perpetual trading fees paid by end users.",
  Revenue: "Portion of perpetual trading fees kept by the protocol treasury.",
  ProtocolRevenue: "Perpetual trading fees routed to the protocol treasury.",
  SupplySideRevenue:
    "Perpetual trading fees paid out to makers (rebates) and the insurance fund.",
  HoldersRevenue: "1024ex has no token; no fees are distributed to token holders.",
};

const dayKey = (tsSec: number) =>
  new Date(tsSec * 1000).toISOString().slice(0, 10); // "YYYY-MM-DD" (UTC)

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const day = options.startOfDay;
  const dateStr = dayKey(day);

  const [volRes, feeRes] = await Promise.all([
    fetchURL(`${API}/volume/history?market_type=perp&from=${day}&to=${day}`),
    fetchURL(`${API}/fees/history?market_type=perp&from=${day}&to=${day}`),
  ]);

  const volRow = (volRes?.data?.data ?? []).find((r: any) => r.date === dateStr);
  const feeRow = (feeRes?.data?.data ?? []).find((r: any) => r.date === dateStr);

  // Endpoint returns USD (USDC) strings already at day granularity.
  return {
    dailyVolume: Number(volRow?.perpVolume ?? 0),
    dailyFees: Number(feeRow?.dailyFees ?? 0),
    dailyUserFees: Number(feeRow?.dailyUserFees ?? feeRow?.dailyFees ?? 0),
    dailyRevenue: Number(feeRow?.dailyRevenue ?? 0),
    dailyProtocolRevenue: Number(feeRow?.dailyProtocolRevenue ?? 0),
    dailySupplySideRevenue: Number(feeRow?.dailySupplySideRevenue ?? 0),
    dailyHoldersRevenue: Number(feeRow?.dailyHoldersRevenue ?? 0),
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  // Dedicated chain slug "1024ex" (1024ex runs its own SVM app-chain; attributing
  // volume to it, not Solana, is the correct top-tier convention — cf. Hyperliquid).
  // The PR must add `EX1024 = "1024ex"` to helpers/chains.ts (see ../helpers-chains.diff).
  chains: [CHAIN.EX1024],
  // First mainnet perp trading day (verified: first non-zero /volume/history row).
  start: "2026-06-10",
  methodology,
};

export default adapter;
