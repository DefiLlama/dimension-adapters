import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/**
 * Archade — social trading app and Solana launchpad.
 *
 * Website: https://archade.io
 * Twitter: https://x.com/archade_io
 *
 * Listed as three products under one parent, the way Pump lists pump.fun, its
 * Terminal and its Mobile App: "Archade" is the web terminal, "Archade Mobile
 * App" is the iOS/Android client, both routing any Solana token to whichever
 * venue has the liquidity; "Archade Launchpad" is Archade's own bonding curves,
 * every swap on a coin launched through Archade from any interface. THIS FILE IS
 * THE MOBILE APP. The mobile client names itself on every request and the trade
 * record keeps it, so web and mobile are disjoint; a trade in an Archade coin
 * made here also appears under the launchpad, so this child is flagged
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
  chains: Record<string, { app: Product; mobile: Product; launchpad: Product }>;
  indexedThrough: number;
}

async function load(options: FetchOptions, product: "app" | "mobile" | "launchpad"): Promise<Product> {
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
  const p = await load(options, "mobile");
  return {
    dailyActiveUsers: p.activeUsers,
    dailyTransactionsCount: p.txs,
  };
};

// version 1: a daily-unique user count cannot be summed from hourly slices.
const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-08-10",
  methodology: "Unique wallets that executed a swap through the Archade mobile app (iOS and Android), and the number of such swaps, in the window.",
};

export default adapter;
