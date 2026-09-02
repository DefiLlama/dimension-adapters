import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/**
 * Archade — social trading app and Solana launchpad.
 *
 * Website: https://archade.io
 * Twitter: https://x.com/archade_io
 *
 * Volume of swaps executed by users through the Archade app. Archade holds no
 * pools of its own: every swap is routed to Meteora DBC, Jupiter, pump.fun or
 * PumpSwap, so this volume is also counted by the venue underneath it, hence
 * doublecounted. Archade-routed swaps are identified by the platform fee the
 * app appends to each swap transaction.
 *
 * Fees and revenue live in fees/archade.ts, off the same endpoint.
 */
const API = "https://archade.io/api/defillama";

interface ApiResponse {
  chains: Record<string, { volume: number }>;
}

const fetch = async (options: FetchOptions) => {
  // Half-open [start, end), matching FetchOptions, so back-to-back windows
  // neither drop nor double-count a trade landing exactly on the boundary.
  const url = `${API}?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const res: ApiResponse = await fetchURL(url);

  const stats = res?.chains?.solana;
  if (!stats) throw new Error(`No data found for ${options.dateString}`);

  return { dailyVolume: stats.volume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-10",
  doublecounted: true,
  methodology: {
    Volume: "USD notional of swaps executed by users through the Archade app, priced at the SOL price recorded on each trade. Trading on Archade-launched bonding curves that did not go through the app is not included.",
  },
};

export default adapter;
