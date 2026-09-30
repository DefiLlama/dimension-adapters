import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// 1024ex options — American, cash-settled, off-chain matching (same model as
// aevo: DefiLlama reads the exchange's own analytics API).
//
// NOTE: the backing endpoint below does NOT exist on `main` yet. The options
// subsystem lives on the `options-risk-p0` branch and is not wired into the
// public analytics API. See ../core-changes/ for the ready-to-apply endpoint
// (migration + SQL query + axum handler). This adapter is complete and matches
// that endpoint's contract; it can be submitted once the endpoint is deployed.
//
//   GET /api/v1/analytics/options/volume/history?from=<sec>&to=<sec>
//   -> { success, data: { data: [ {date, notionalVolume, premiumVolume, fees} ] }, meta }
const API = "https://api-mainnet.1024ex.com/api/v1/analytics";

// Options dashboards require dailyNotionalVolume + dailyPremiumVolume; plain
// dailyVolume is not allowed here (options/AGENTS.md). Notional and premium are
// two different numbers — do not conflate them.
const methodology = {
  NotionalVolume:
    "Underlying notional of options contracts traded: strike price x contracts x contract multiplier, summed per UTC day.",
  PremiumVolume:
    "Premium actually exchanged on options trades: premium price x contracts, summed per UTC day.",
  Fees:
    "Options trading fees paid by users for the day (taker + maker, net of rebates).",
  UserFees: "Options trading fees paid by end users.",
};

const dayKey = (tsSec: number) =>
  new Date(tsSec * 1000).toISOString().slice(0, 10); // "YYYY-MM-DD" (UTC)

async function fetch(options: FetchOptions) {
  const day = options.startOfDay;
  const dateStr = dayKey(day);

  const res = await fetchURL(`${API}/options/volume/history?from=${day}&to=${day}`);
  const row = (res?.data?.data ?? []).find((r: any) => r.date === dateStr);

  return {
    dailyNotionalVolume: Number(row?.notionalVolume ?? 0),
    dailyPremiumVolume: Number(row?.premiumVolume ?? 0),
    dailyFees: Number(row?.fees ?? 0),
    dailyUserFees: Number(row?.fees ?? 0),
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  // Dedicated chain slug "1024ex" (see perp adapter note + ../helpers-chains.diff).
  chains: [CHAIN.EX1024],
  // First mainnet options fill day. TODO(confirm) once the options endpoint is
  // deployed: re-check against /analytics/options/volume/history first non-zero row.
  start: "2026-08-29",
  methodology,
};

export default adapter;
