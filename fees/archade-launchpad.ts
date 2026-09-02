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


/**
 * THE LAUNCHPAD'S FEES. Coins launched through Archade trade on bonding curves
 * under a config Archade owns. Read off that config rather than asserted: a
 * flat 1.25% of the quote side, fees taken in wSOL only, and a creator share of
 * 30%. That splits into
 *   0.25%  the curve program's protocol share, taken off the top; part of it
 *          is handed back to whichever interface hosted the swap, reported as a
 *          separate referral leg.
 *   1.00%  the curve trading fee, split 0.30% to the coin creator and 0.70% to
 *          Archade as the config's fee claimer.
 * Archade earns none of the referral leg: it passes no referral account, so all
 * of it went to third-party interfaces routing into Archade's curves.
 *
 * Plus the 0.02 SOL pool creation fee, paid by the coin creator, split 90%
 * Archade / 10% the curve program. Launches by Archade-affiliated wallets are
 * excluded upstream: those move money from the team to the treasury and are
 * not a fee anyone paid.
 *
 * NOT COUNTED, empty rather than missing: post-graduation LP fees. No Archade
 * coin has graduated yet; the leg is added when the first one does.
 *
 * Every figure is decoded from the curve program's own swap events and
 * reconciled against each pool's lifetime counters before it is served.
 */
const LABEL = {
  CURVE: "Curve Trading Fees",
  CREATOR: METRIC.CREATOR_FEES,
  VENUE: "Bonding Curve Protocol Fees",
  REFERRAL: "Bonding Curve Referral Fees",
  LAUNCH: "Token Launch Fees",
  CURVE_KEPT: "Curve Trading Fees To Treasury",
  LAUNCH_KEPT: "Token Launch Fees To Treasury",
  CREATOR_PAID: "Curve Trading Fees To Creators",
  VENUE_PAID: "Curve Protocol Share",
  REFERRAL_PAID: "Curve Referral Share",
  LAUNCH_PAID: "Launch Fee Protocol Share",
} as const;


type Stream =
  | "curve_partner"
  | "curve_creator"
  | "curve_meteora"
  | "curve_referral"
  | "launch_partner"
  | "launch_meteora";

const fetch = async (options: FetchOptions) => {
  const p = await load(options, "launchpad");
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const leg of p.fees) {
    const { token, amount } = leg;
    switch (leg.stream as Stream) {
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
      case "launch_partner":
        dailyFees.add(token, amount, LABEL.LAUNCH);
        dailyRevenue.add(token, amount, LABEL.LAUNCH_KEPT);
        break;
      case "launch_meteora":
        dailyFees.add(token, amount, LABEL.LAUNCH);
        dailySupplySideRevenue.add(token, amount, LABEL.LAUNCH_PAID);
        break;
      default:
        // An unknown leg has no destination and would break
        // Fees = Revenue + SupplySide, so it is an error, not a silent drop.
        throw new Error(`Archade launchpad returned an unknown fee stream: ${leg.stream}`);
    }
  }

  const v = p.volume as { token: string; amount: string };
  const dailyVolume = options.createBalances();
  dailyVolume.add(v.token, v.amount);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};
const methodology = {
  Volume: "Quote-side notional of every swap on a bonding curve launched through Archade, from any interface: the input on a buy, the output on a sell.",
  Fees: "Everything users pay on Archade's curves: the full 1.25% bonding curve fee on coins launched through Archade, including the shares that go to the coin creator, to the bonding curve program and to routing referrers, plus the 0.02 SOL pool creation fee. Post-graduation DAMM v2 fees are not counted because no Archade coin has graduated yet.",
  UserFees: "Same as Fees. Every leg is paid by a trader or by a coin creator; launches by Archade-affiliated wallets are excluded because those are internal transfers rather than fees.",
  Revenue: "What Archade keeps: its 0.70% share of each bonding curve trade and 90% of each 0.02 SOL pool creation fee.",
  ProtocolRevenue: "Same as Revenue. All of it lands in the Archade treasury on Solana; there is no staking or holder leg.",
  SupplySideRevenue: "What Archade does not keep: the coin creator's 30% of the curve trading fee, the curve program's protocol share taken off the top, the referral leg it hands to whichever interface hosted the swap, and its 10% of the pool creation fee.",
  HoldersRevenue: "None. Archade has no token.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.CURVE]: "Archade's 0.70% share of each bonding curve trade on a coin launched through it.",
    [LABEL.CREATOR]: "The coin creator's 0.30% share of the same curve trading fee, set by the config's creator_trading_fee_percentage of 30.",
    [LABEL.VENUE]: "The bonding curve program's 0.25% protocol share, taken off the top before the curve accumulates anything.",
    [LABEL.REFERRAL]: "The part of the curve program's protocol share handed back to whichever interface hosted the swap. Archade passes no referral account, so none of it is Archade's.",
    [LABEL.LAUNCH]: "The config's 0.02 SOL pool creation fee, paid by the coin creator when the pool is created.",
  },
  UserFees: {
    [LABEL.CURVE]: "Traders pay the bonding curve fee; this is the part Archade keeps.",
    [LABEL.CREATOR]: "Traders pay the bonding curve fee; this is the part the coin creator keeps.",
    [LABEL.VENUE]: "Traders pay the curve program's protocol share on every bonding curve trade.",
    [LABEL.REFERRAL]: "Traders pay the referral leg inside the curve program's protocol share.",
    [LABEL.LAUNCH]: "Coin creators pay 0.02 SOL to create a pool.",
  },
  Revenue: {
    [LABEL.CURVE_KEPT]: "Archade's 0.70% partner share of curve trades, claimable only by the config's fee_claimer.",
    [LABEL.LAUNCH_KEPT]: "Archade's 90% share of each 0.02 SOL pool creation fee.",
  },
  ProtocolRevenue: {
    [LABEL.CURVE_KEPT]: "100% of Archade's partner share of curve fees goes to the Archade treasury.",
    [LABEL.LAUNCH_KEPT]: "100% of Archade's share of pool creation fees goes to the Archade treasury.",
  },
  SupplySideRevenue: {
    [LABEL.CREATOR_PAID]: "The coin creator's 30% of the curve trading fee, floored per swap by the program and claimable by the creator directly.",
    [LABEL.VENUE_PAID]: "The bonding curve program's protocol share of the curve fee.",
    [LABEL.REFERRAL_PAID]: "The referral leg the curve program pays to whichever interface hosted the swap.",
    [LABEL.LAUNCH_PAID]: "The curve program's 10% of each pool creation fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  // First pool created under the config.
  start: "2026-08-12",
  methodology,
  breakdownMethodology,
};

export default adapter;
