import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_BASE = "https://app.perptools.ai/api";

function formatDateFromTimestamp(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const fetch = async (options: FetchOptions) => {
  const dateStr = formatDateFromTimestamp(options.startOfDay);
  const url = `${API_BASE}/v1/oi/daily?date=${dateStr}`;
  const data = (await httpGet(url)) as { open_interest_usd: number };
  const openInterestAtEnd = Number(data.open_interest_usd ?? 0);
  if (isNaN(openInterestAtEnd) || openInterestAtEnd < 0) {
    throw new Error(`Invalid open interest from API: ${data.open_interest_usd} for date ${dateStr}`);
  }
  return {
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ORDERLY],
  start: "2026-02-27", // Perptools/Orderly launch
};

export default adapter;
