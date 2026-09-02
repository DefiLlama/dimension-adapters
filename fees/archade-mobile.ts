import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
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


/**
 * THE APP'S FEE. A flat 1% (0.5% before June 2026) appended to every swap the
 * app routes, on top of the venue's own fee, taken in the quote asset inside the
 * swap transaction so it reverts with the trade. Nothing is shared with LPs,
 * routers, referrers or token holders, and Archade has no token, so
 * dailyFees == dailyRevenue == dailyProtocolRevenue.
 *
 * Measured, not computed: the figure is the treasury's balance delta inside the
 * swap transaction, so a trade that paid less than 1% is reported at what it
 * paid. Under-reports rather than over: a swap that lands on chain but whose
 * record call fails is not counted.
 */
const fetch = async (options: FetchOptions) => {
  const p = await load(options, "mobile");
  const dailyFees = options.createBalances();
  for (const leg of p.fees) {
    if (leg.stream !== "app_swap_fee") continue;
    dailyFees.add(leg.token, leg.amount, METRIC.TRADING_FEES);
  }
  return {
    dailyVolume: p.volume as number,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Volume: "USD notional of swaps executed by users through the Archade mobile app (iOS and Android), priced at the SOL price recorded on each trade.",
  Fees: "Archade's platform fee on every swap routed through the mobile app, taken in the quote asset inside the swap transaction itself. 1% since June 2026, 0.5% before that. Reported at the amount actually taken.",
  UserFees: "Users pay the platform fee on each swap, on top of the underlying venue's own fees.",
  Revenue: "All of it. Archade shares none of the swap fee with liquidity providers, routers or referrers.",
  ProtocolRevenue: "100% of the platform fee is sent to the Archade treasury on Solana.",
  SupplySideRevenue: "No fees are shared with liquidity providers.",
  HoldersRevenue: "None. Archade has no token.",
};

const breakdownMethodology = {
  Fees: { [METRIC.TRADING_FEES]: "Archade's platform fee on every swap routed through the mobile app: 1% since June 2026, 0.5% before that." },
  UserFees: { [METRIC.TRADING_FEES]: "Users pay the platform fee on each swap, on top of the underlying venue's fees." },
  Revenue: { [METRIC.TRADING_FEES]: "All platform fees are retained by Archade in its treasury." },
  ProtocolRevenue: { [METRIC.TRADING_FEES]: "100% of platform fees are sent to the Archade treasury on Solana." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-08-10",
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
