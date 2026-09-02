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
  Volume: "Swaps on bonding curves launched through Archade, plus swaps routed through the Archade app to other venues.",
  Fees: "Trading fees paid by users on swaps routed through the Archade app, plus bonding curve trade fees and pool creation fees on coins launched through Archade. Fees after a coin graduates to a DEX pool are not included yet.",
  UserFees: "Same as Fees. Every fee is paid by a trader or a coin creator.",
  Revenue: "Archade's platform fee on app swaps, its share of bonding curve trade fees, and its share of pool creation fees.",
  ProtocolRevenue: "Same as Revenue. All of it goes to the Archade treasury.",
  SupplySideRevenue: "Fees paid to coin creators, affiliate partners and the bonding curve program.",
  HoldersRevenue: "None. Archade has no token.",
};

const feeLegs = {
  [LABEL.APP]: "Archade's 1% platform fee on swaps routed through the app.",
  [LABEL.CURVE]: "Archade's share of the bonding curve trade fee on coins launched through it.",
  [LABEL.AFFILIATE]: "The affiliate partner's slice of Archade's bonding curve share.",
  [LABEL.CREATOR]: "The coin creator's share of the bonding curve trade fee.",
  [LABEL.VENUE]: "The bonding curve program's share of the trade fee.",
  [LABEL.REFERRAL]: "The referral leg of the bonding curve program's share.",
  [LABEL.LAUNCH]: "The 0.02 SOL pool creation fee paid by the coin creator.",
};

const keptLegs = {
  [LABEL.APP_KEPT]: "App platform fees, kept by Archade.",
  [LABEL.CURVE_KEPT]: "Archade's share of bonding curve trade fees, net of affiliate partner slices.",
  [LABEL.LAUNCH_KEPT]: "Archade's 90% share of pool creation fees.",
};

const breakdownMethodology = {
  Fees: feeLegs,
  UserFees: feeLegs,
  Revenue: keptLegs,
  ProtocolRevenue: keptLegs,
  SupplySideRevenue: {
    [LABEL.CREATOR_PAID]: "Bonding curve trade fees paid to coin creators.",
    [LABEL.AFFILIATE_PAID]: "Archade's bonding curve share paid on to affiliate partners.",
    [LABEL.VENUE_PAID]: "Bonding curve trade fees kept by the bonding curve program.",
    [LABEL.REFERRAL_PAID]: "Referral fees the bonding curve program pays to the hosting interface.",
    [LABEL.LAUNCH_PAID]: "The bonding curve program's 10% share of pool creation fees.",
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
