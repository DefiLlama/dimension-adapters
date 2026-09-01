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
 * THREE FEE SOURCES, ONE PROTOCOL.
 *
 * 1. APP SWAP FEE. A flat 1% (0.5% before June 2026) appended to every swap the
 *    app routes, on top of the venue's own fee, taken in the quote asset inside
 *    the swap transaction itself so it reverts with the trade. The venue may be
 *    Meteora DBC, Jupiter, pump.fun or PumpSwap. None of it is shared.
 *
 * 2. BONDING CURVE. Coins launched on Archade run on a Meteora Dynamic Bonding
 *    Curve config Archade owns. Read off that account rather than asserted: a
 *    flat 1.25% of the quote side, collect_fee_mode 0 so fees are only ever
 *    taken in wSOL, and creator_trading_fee_percentage 30. That splits into
 *      0.25%  Meteora's protocol share, taken off the top. Part of it is handed
 *             back to whichever interface hosted the swap; the program reports
 *             the two legs separately.
 *      1.00%  the curve trading fee, split
 *               0.30%  the coin creator
 *               0.70%  Archade, as the config's fee_claimer
 *    Archade earns none of the referral leg: both instruction builders in the
 *    app pass a null referral account, so every lamport of it went to
 *    third-party interfaces routing into Archade's pools.
 *
 * 3. POOL CREATION FEE. The same config charges 0.02 SOL to create a pool, paid
 *    by the coin creator, split 90% Archade / 10% Meteora. Launches by
 *    Archade-affiliated wallets are excluded upstream: those move money from the
 *    team to the treasury and are not a fee anyone paid.
 *
 * NOT COUNTED, and empty rather than missing. When a curve completes it migrates
 * to a DAMM v2 pool where Archade holds locked LP worth 40 bps of
 * post-graduation volume. No Archade coin has graduated yet — every pool reads
 * is_migrated = 0 against an ~86 SOL threshold — so the leg is added when the
 * first one does. Premium subscriptions are likewise zero: the sale is off and
 * every grant to date is comped.
 *
 * Archade has no token, so there is no holders revenue and none is planned.
 *
 * The endpoint aggregates all of it over an arbitrary half-open [start, end)
 * window of unix seconds, in integer base units of a named quote mint, and
 * publishes how far its on-chain indexer has read so a half-indexed window is
 * retried rather than recorded low.
 */
const API = "https://archade.io/api/defillama";

const LABEL = {
  APP: METRIC.TRADING_FEES,
  CURVE: "Curve Trading Fees",
  CREATOR: METRIC.CREATOR_FEES,
  METEORA: "Meteora Protocol Fees",
  REFERRAL: "Meteora Referral Fees",
  LAUNCH: "Token Launch Fees",
  APP_KEPT: "Trading Fees To Treasury",
  CURVE_KEPT: "Curve Trading Fees To Treasury",
  LAUNCH_KEPT: "Token Launch Fees To Treasury",
  CREATOR_PAID: "Curve Trading Fees To Creators",
  METEORA_PAID: "Curve Trading Fees To Meteora",
  REFERRAL_PAID: "Curve Trading Fees To Routing Referrers",
  LAUNCH_PAID: "Token Launch Fees To Meteora",
} as const;

type Stream =
  | "app_swap_fee"
  | "curve_partner"
  | "curve_creator"
  | "curve_meteora"
  | "curve_referral"
  | "launch_partner"
  | "launch_meteora";

interface FeeLeg { stream: Stream; token: string; amount: string }
interface ChainStats { volume: number; fees: FeeLeg[] }
interface ApiResponse { chains: Record<string, ChainStats>; indexedThrough: number }

const fetch = async (options: FetchOptions) => {
  // The endpoint's window is half-open, matching FetchOptions, so endTimestamp
  // passes through as-is: back-to-back windows neither drop nor double-count a
  // trade or a swap landing exactly on the boundary.
  const url = `${API}?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const res: ApiResponse = await fetchURL(url);

  const stats = res?.chains?.solana;
  if (!stats) throw new Error(`No data found for ${options.dateString}`);

  // Curve fees are indexed from chain by a job rather than written by the app,
  // so a window can be asked for before the job has read it. Throwing makes the
  // runner retry; returning what exists would record a real but low number that
  // nothing would ever correct.
  if (!(res.indexedThrough >= options.endTimestamp)) {
    throw new Error(
      `Archade has indexed through ${res.indexedThrough}, window ends ${options.endTimestamp}`,
    );
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const leg of stats.fees ?? []) {
    const { token, amount } = leg;
    switch (leg.stream) {
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
        dailyFees.add(token, amount, LABEL.METEORA);
        dailySupplySideRevenue.add(token, amount, LABEL.METEORA_PAID);
        break;
      case "curve_referral":
        dailyFees.add(token, amount, LABEL.REFERRAL);
        dailySupplySideRevenue.add(token, amount, LABEL.REFERRAL_PAID);
        break;
      case "launch_partner":
        dailyFees.add(token, amount, LABEL.LAUNCH);
        dailyRevenue.add(token, amount, LABEL.LAUNCH_KEPT);
        break;
      case "launch_meteora":
        dailyFees.add(token, amount, LABEL.LAUNCH);
        dailySupplySideRevenue.add(token, amount, LABEL.LAUNCH_PAID);
        break;
      default: {
        // A leg with no destination would break Fees = Revenue + SupplySide, so
        // an unknown one is an error rather than something to drop into Fees.
        const unreachable: never = leg.stream;
        throw new Error(`Archade returned an unknown fee stream: ${unreachable}`);
      }
    }
  }

  return {
    dailyVolume: stats.volume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Volume: "USD notional of swaps executed by users through the Archade app, priced at the SOL price recorded on each trade. Trading on Archade-launched bonding curves that did not go through the app is not included.",
  Fees: "Everything users pay across Archade's three fee sources: the app's platform fee on each routed swap; the full 1.25% Meteora Dynamic Bonding Curve fee on coins launched under Archade's config, including the shares that go to the coin creator, to Meteora and to routing referrers; and the 0.02 SOL pool creation fee. Post-graduation DAMM v2 fees are not counted because no Archade coin has graduated yet.",
  UserFees: "Same as Fees. Every leg is paid by a trader or by a coin creator; launches by Archade-affiliated wallets are excluded because those are internal transfers rather than fees.",
  Revenue: "What Archade keeps: the whole app platform fee, its 0.70% partner share of each bonding curve trade, and 90% of each 0.02 SOL pool creation fee.",
  ProtocolRevenue: "Same as Revenue. All of it lands in the Archade treasury on Solana; there is no staking or holder leg.",
  SupplySideRevenue: "What Archade does not keep: the coin creator's 30% of the curve trading fee, Meteora's protocol share taken off the top, the referral leg Meteora hands to whichever interface hosted the swap, and Meteora's 10% of the pool creation fee.",
  HoldersRevenue: "None. Archade has no token.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.APP]: "Archade's platform fee on every swap routed through the app: 1% since June 2026, 0.5% before that, taken in the quote asset inside the swap transaction.",
    [LABEL.CURVE]: "Archade's 0.70% partner share of each Meteora DBC trade on a coin launched under its config.",
    [LABEL.CREATOR]: "The coin creator's 0.30% share of the same curve trading fee, set by the config's creator_trading_fee_percentage of 30.",
    [LABEL.METEORA]: "Meteora's 0.25% protocol share, taken off the top before the curve accumulates anything.",
    [LABEL.REFERRAL]: "The part of Meteora's protocol share handed back to whichever interface hosted the swap. Archade passes a null referral account, so none of it is Archade's.",
    [LABEL.LAUNCH]: "The config's 0.02 SOL pool creation fee, paid by the coin creator when the pool is created.",
  },
  UserFees: {
    [LABEL.APP]: "Traders pay the platform fee on each swap, on top of the underlying venue's own fees.",
    [LABEL.CURVE]: "Traders pay the bonding curve fee; this is the part Archade keeps.",
    [LABEL.CREATOR]: "Traders pay the bonding curve fee; this is the part the coin creator keeps.",
    [LABEL.METEORA]: "Traders pay Meteora's protocol share on every bonding curve trade.",
    [LABEL.REFERRAL]: "Traders pay the referral leg inside Meteora's protocol share.",
    [LABEL.LAUNCH]: "Coin creators pay 0.02 SOL to create a pool.",
  },
  Revenue: {
    [LABEL.APP_KEPT]: "All app platform fees are retained by Archade in its treasury.",
    [LABEL.CURVE_KEPT]: "Archade's 0.70% partner share of curve trades, claimable only by the config's fee_claimer.",
    [LABEL.LAUNCH_KEPT]: "Archade's 90% share of each 0.02 SOL pool creation fee.",
  },
  ProtocolRevenue: {
    [LABEL.APP_KEPT]: "100% of app platform fees go to the Archade treasury on Solana.",
    [LABEL.CURVE_KEPT]: "100% of Archade's partner share of curve fees goes to the Archade treasury.",
    [LABEL.LAUNCH_KEPT]: "100% of Archade's share of pool creation fees goes to the Archade treasury.",
  },
  SupplySideRevenue: {
    [LABEL.CREATOR_PAID]: "The coin creator's 30% of the curve trading fee, floored per swap by the program and claimable by the creator directly.",
    [LABEL.METEORA_PAID]: "Meteora's protocol share of the curve fee.",
    [LABEL.REFERRAL_PAID]: "The referral leg Meteora pays to whichever interface hosted the swap.",
    [LABEL.LAUNCH_PAID]: "Meteora's 10% of each pool creation fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  // The first app-routed swap. The curve and launch legs are simply zero before
  // the first pool was created under the config on 2026-08-12.
  start: "2026-02-10",
  // Meteora's own listing reports the same underlying DBC swap fees.
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
