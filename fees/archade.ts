import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
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

const LABEL = {
  APP: METRIC.TRADING_FEES,
  CURVE: "Curve Trading Fees",
  CREATOR: METRIC.CREATOR_FEES,
  VENUE: "Bonding Curve Protocol Fees",
  REFERRAL: "Bonding Curve Referral Fees",
  AFFILIATE: "Affiliate Partner Fees",
  LAUNCH: "Token Launch Fees",
  APP_KEPT: "Trading Fees To Treasury",
  CURVE_KEPT: "Curve Trading Fees To Treasury",
  LAUNCH_KEPT: "Token Launch Fees To Treasury",
  CREATOR_PAID: "Curve Trading Fees To Creators",
  VENUE_PAID: "Curve Protocol Share",
  REFERRAL_PAID: "Curve Referral Share",
  AFFILIATE_PAID: "Curve Trading Fees To Affiliate Partners",
  LAUNCH_PAID: "Launch Fee Protocol Share",
} as const;

const fetch = async (options: FetchOptions) => {
  const s = await load(options);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const { stream, token, amount } of s.fees) {
    switch (stream) {
      case "app_swap_fee":
        dailyFees.add(token, amount, LABEL.APP);
        dailyRevenue.add(token, amount, LABEL.APP_KEPT);
        break;
      case "curve_partner":
        dailyFees.add(token, amount, LABEL.CURVE);
        dailyRevenue.add(token, amount, LABEL.CURVE_KEPT);
        break;
      case "curve_creator":
        dailyFees.add(token, amount, LABEL.CREATOR);
        dailySupplySideRevenue.add(token, amount, LABEL.CREATOR_PAID);
        break;
      case "curve_meteora":
        dailyFees.add(token, amount, LABEL.VENUE);
        dailySupplySideRevenue.add(token, amount, LABEL.VENUE_PAID);
        break;
      case "curve_referral":
        dailyFees.add(token, amount, LABEL.REFERRAL);
        dailySupplySideRevenue.add(token, amount, LABEL.REFERRAL_PAID);
        break;
      case "curve_affiliate":
        // Only served for v=2: the affiliate partner's slice of Archade's own
        // share. Traders pay it, Archade never keeps it.
        dailyFees.add(token, amount, LABEL.AFFILIATE);
        dailySupplySideRevenue.add(token, amount, LABEL.AFFILIATE_PAID);
        break;
      case "launch_partner":
        dailyFees.add(token, amount, LABEL.LAUNCH);
        dailyRevenue.add(token, amount, LABEL.LAUNCH_KEPT);
        break;
      case "launch_meteora":
        dailyFees.add(token, amount, LABEL.LAUNCH);
        dailySupplySideRevenue.add(token, amount, LABEL.LAUNCH_PAID);
        break;
      default:
        // A leg with no destination would break Fees = Revenue + SupplySide.
        throw new Error(`Archade returned an unknown fee stream: ${stream}`);
    }
  }

  return {
    dailyVolume: volumeOf(options, s),
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Volume: "Every swap Archade is part of, counted once: every swap on a bonding curve launched through Archade from any interface, plus swaps routed through the Archade app to other venues. Curve swaps are the quote-side notional (input on a buy, output on a sell); app swaps are priced at the SOL price recorded on the trade.",
  Fees: "Everything users pay: the app's platform fee on each routed swap (1% since June 2026, 0.5% before), the full 1.25% bonding curve fee on coins launched through Archade, and the 0.02 SOL pool creation fee. Fees earned after a coin graduates from its bonding curve to a DEX pool are not yet included; no Archade coin has graduated.",
  UserFees: "Same as Fees. Every leg is paid by a trader or a coin creator; launches by Archade-affiliated wallets are excluded as internal transfers.",
  Revenue: "What Archade keeps: the whole app platform fee, its 0.70% share of each bonding curve trade net of any affiliate partner's slice, and 90% of each 0.02 SOL pool creation fee. Fees earned after a coin graduates from its bonding curve to a DEX pool are not yet included; no Archade coin has graduated.",
  ProtocolRevenue: "Same as Revenue. All of it lands in the Archade treasury on Solana; there is no staking or holder leg.",
  SupplySideRevenue: "What Archade does not keep: the coin creator's 30% of the curve trading fee, the curve program's protocol share, the referral leg it hands to whichever interface hosted the swap, the slice of Archade's own share that an affiliate partner earns on coins launched through their invite, and the program's 10% of the pool creation fee.",
  HoldersRevenue: "None. Archade has no token.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.APP]: "Archade's platform fee on every swap routed through the app: 1% since June 2026, 0.5% before that, taken in the quote asset inside the swap transaction.",
    [LABEL.CURVE]: "Archade's 0.70% share of each bonding curve trade on a coin launched through it, net of any affiliate partner's slice.",
    [LABEL.CREATOR]: "The coin creator's 0.30% share of the same curve trading fee.",
    [LABEL.VENUE]: "The bonding curve program's 0.25% protocol share, taken off the top.",
    [LABEL.REFERRAL]: "The part of the curve program's protocol share handed back to whichever interface hosted the swap. Archade passes no referral account, so none of it is Archade's.",
    [LABEL.AFFILIATE]: "The slice of Archade's bonding curve share that an affiliate partner earns on coins launched through their invite.",
    [LABEL.LAUNCH]: "The 0.02 SOL pool creation fee, paid by the coin creator when the pool is created.",
  },
  UserFees: {
    [LABEL.APP]: "Traders pay the platform fee on each swap, on top of the underlying venue's own fees.",
    [LABEL.CURVE]: "Traders pay the bonding curve fee; this is the part Archade keeps.",
    [LABEL.CREATOR]: "Traders pay the bonding curve fee; this is the part the coin creator keeps.",
    [LABEL.VENUE]: "Traders pay the curve program's protocol share on every bonding curve trade.",
    [LABEL.REFERRAL]: "Traders pay the referral leg inside the curve program's protocol share.",
    [LABEL.AFFILIATE]: "Traders pay the bonding curve fee; this is the part of Archade's share that goes to the affiliate partner whose invite launched the coin.",
    [LABEL.LAUNCH]: "Coin creators pay 0.02 SOL to create a pool.",
  },
  Revenue: {
    [LABEL.APP_KEPT]: "All app platform fees are retained by Archade in its treasury.",
    [LABEL.CURVE_KEPT]: "Archade's 0.70% share of curve trades net of any affiliate partner's slice, claimable only by the config's fee claimer.",
    [LABEL.LAUNCH_KEPT]: "Archade's 90% share of each 0.02 SOL pool creation fee.",
  },
  ProtocolRevenue: {
    [LABEL.APP_KEPT]: "100% of app platform fees go to the Archade treasury on Solana.",
    [LABEL.CURVE_KEPT]: "100% of Archade's share of curve fees goes to the Archade treasury.",
    [LABEL.LAUNCH_KEPT]: "100% of Archade's share of pool creation fees goes to the Archade treasury.",
  },
  SupplySideRevenue: {
    [LABEL.CREATOR_PAID]: "The coin creator's 30% of the curve trading fee, floored per swap by the program and claimable by the creator directly.",
    [LABEL.VENUE_PAID]: "The bonding curve program's protocol share of the curve fee.",
    [LABEL.REFERRAL_PAID]: "The referral leg the curve program pays to whichever interface hosted the swap.",
    [LABEL.AFFILIATE_PAID]: "The affiliate partner's slice of Archade's bonding curve share, accrued per swap and claimed by the partner directly.",
    [LABEL.LAUNCH_PAID]: "The curve program's 10% of each pool creation fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-10",
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
