import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/**
 * Archade — social trading app and launchpad on Solana.
 *
 * Website: https://archade.io
 * Twitter: https://x.com/archade_io
 *
 * One listing. Archade is a trading terminal, any Solana token routed to
 * whichever venue has the liquidity with a flat 1% platform fee appended, and a
 * launchpad, coins launched through it trade on bonding curves under a config
 * Archade owns. Both are reported here, together.
 *
 * VOLUME is every swap Archade is part of, counted once: every swap on an
 * Archade curve from any interface, plus swaps routed through the app to other
 * venues. A swap made in the app on an Archade coin sits in both ledgers and is
 * counted on the curve side only, by signature. Routed volume is also counted
 * by the venue underneath, hence doublecounted.
 *
 * FEES is everything users pay: the app's platform fee (1% since June 2026,
 * 0.5% before), the full 1.25% bonding curve fee on Archade coins, and the
 * 0.02 SOL pool creation fee. REVENUE is what Archade keeps: the whole app fee,
 * its 0.70% share of each curve trade net of any affiliate partner's slice, and
 * 90% of each creation fee. SUPPLY-SIDE is the rest: the coin creator's 30% of
 * the curve fee, the curve program's protocol share, the referral leg it hands
 * to whichever interface hosted the swap, the slice of Archade's share that an
 * affiliate partner earns on coins launched through their invite, and the
 * program's 10% of the creation fee. Launches by Archade-affiliated wallets are
 * excluded upstream as internal transfers. Fees earned after a coin graduates
 * from its bonding curve to a DEX pool are not included yet, and the
 * methodology says so: no Archade coin has graduated.
 *
 * Every curve figure is decoded from the curve program's own swap events and
 * reconciled against each pool's lifetime counters before it is served; the
 * app fee is the treasury's measured balance delta inside the swap transaction.
 * Archade has no token, so there is no holders revenue.
 *
 * The endpoint serves a half-open [start, end) window of unix seconds and
 * publishes how far the on-chain indexer has read, so a half-indexed window is
 * retried rather than recorded low. It is called with v=2, which reports an
 * affiliate partner's slice of Archade's curve share as its own stream,
 * curve_affiliate. Without it the endpoint keeps that slice inside
 * curve_partner, so an adapter that does not know the stream never sees it.
 */
const API = "https://archade.io/api/defillama";
const API_VERSION = 2;

interface FeeLeg { stream: string; token: string; amount: string }
interface ApiResponse {
  chains: Record<string, {
    volume: number;
    curveVolume: { token: string; amount: string };
    fees: FeeLeg[];
    activeUsers: number;
    txs: number;
  }>;
  indexedThrough: number;
}

async function load(options: FetchOptions) {
  const url = `${API}?start=${options.startTimestamp}&end=${options.endTimestamp}&v=${API_VERSION}`;
  const res: ApiResponse = await fetchURL(url);
  const s = res?.chains?.solana;
  if (!s) throw new Error(`No data for ${options.dateString}`);
  if (!(res.indexedThrough >= options.endTimestamp)) {
    throw new Error(`Archade has indexed through ${res.indexedThrough}, window ends ${options.endTimestamp}`);
  }
  return s;
}

function volumeOf(options: FetchOptions, s: ApiResponse["chains"][string]) {
  const v = options.createBalances();
  v.addUSDValue(s.volume);
  v.add(s.curveVolume.token, s.curveVolume.amount);
  return v;
}

const fetch = async (options: FetchOptions) => {
  const s = await load(options);
  return { dailyVolume: volumeOf(options, s) };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-10",
  doublecounted: true,
  methodology: {
    Volume: "Every swap Archade is part of, counted once: every swap on a bonding curve launched through Archade from any interface, plus swaps routed through the Archade app to other venues. Curve swaps are the quote-side notional (input on a buy, output on a sell); app swaps are priced at the SOL price recorded on the trade.",
  },
};

export default adapter;
