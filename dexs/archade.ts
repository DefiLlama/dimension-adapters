import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/**
 * Archade — social trading app and Solana launchpad.
 *
 * Website: https://archade.io
 * Twitter: https://x.com/archade_io
 *
 * Listed as two products under one parent, the way Pump lists pump.fun and its
 * Terminal: "Archade" is the trading app, any Solana token routed to whichever
 * venue has the liquidity; "Archade Launchpad" is Archade's own bonding curves,
 * every swap on a coin launched through Archade from any interface. A trade in
 * an Archade coin made inside the app appears in both, so the app is flagged
 * doublecounted.
 *
 * One endpoint serves both, over a half-open [start, end) window of unix
 * seconds, and publishes how far the on-chain indexer has read so a
 * half-indexed window is retried rather than recorded low.
 */
const API = "https://archade.io/api/defillama";

interface FeeLeg { stream: string; token: string; amount: string }
interface Product {
  volume: number | { token: string; amount: string };
  fees: FeeLeg[];
  activeUsers: number;
  txs: number;
}
interface ApiResponse {
  chains: Record<string, { app: Product; launchpad: Product }>;
  indexedThrough: number;
}

async function load(options: FetchOptions, product: "app" | "launchpad"): Promise<Product> {
  const url = `${API}?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const res: ApiResponse = await fetchURL(url);
  const p = res?.chains?.solana?.[product];
  if (!p) throw new Error(`No ${product} data for ${options.dateString}`);
  // Curve data is indexed from chain by a job; a window that runs past what it
  // has read is retried rather than recorded low.
  if (!(res.indexedThrough >= options.endTimestamp)) {
    throw new Error(`Archade has indexed through ${res.indexedThrough}, window ends ${options.endTimestamp}`);
  }
  return p;
}

const fetch = async (options: FetchOptions) => {
  const p = await load(options, "app");
  return { dailyVolume: p.volume as number };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-10",
  doublecounted: true,
  methodology: {
    Volume: "USD notional of swaps executed by users through the Archade app, priced at the SOL price recorded on each trade. Routed to the venue with the liquidity, so it is also counted there.",
  },
};

export default adapter;
