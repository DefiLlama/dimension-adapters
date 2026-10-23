import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// OrbitDEX — perpetual futures frontend built on Orderly Network
// Website: https://trade.orbitdex.app
// Twitter/X: https://x.com/OrbitPerps
// Orderly broker ID: orbit (confirmed via https://api-evm.orderly.org/v1/public/broker/name?broker_id=orbit)

const ORDERLY_API = "https://api-evm.orderly.org";
const BROKER_ID = "orbit";

interface DailyStatRow {
  date: string;
  takerVolume: string;
}

const fetch = async (options: FetchOptions) => {
  // Orderly builder daily stats — per-UTC-day records for broker orbit.
  // Returns an array of rows; each row covers one day where trades occurred.
  const rows: DailyStatRow[] = await fetchURL(
    `${ORDERLY_API}/md/volume/builder/daily_stats?broker_id=${BROKER_ID}`
  );

  // Match the row whose ISO date resolves to the requested UTC day (options.dateString = "YYYY-MM-DD").
  const record = rows.find(
    (r) => new Date(r.date).toISOString().split("T")[0] === options.dateString
  );

  return {
    // Returns 0 when no trades were executed on Orbit for the requested day — expected behaviour.
    // Taker-side only — makerVolume is excluded to avoid double-counting both sides of a fill.
    dailyVolume: record ? Number(record.takerVolume) : 0,
  };
};

const methodology = {
  Volume:
    "Perpetual futures taker-side notional volume generated through the Orbit frontend " +
    "(Orderly Network broker_id: orbit). Sourced from the Orderly builder daily_stats API. " +
    "Taker-side only to avoid double counting maker + taker fills. " +
    "Returns 0 for days with no Orbit trades. Aggregated across all chains where " +
    "Orderly Network is deployed (Ethereum, Arbitrum, Optimism, Base, Solana, and others).",
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.CHAIN_GLOBAL],
  fetch,
  start: "2026-08-03",
  methodology,
};

export default adapter;
