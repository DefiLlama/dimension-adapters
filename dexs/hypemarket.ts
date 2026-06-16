import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// HypeMarket DefiLlama feeds, per UTC day, in raw SUPRA base units. SUPRA-only.
const VOLUME_URL = "https://api.hypemarket.trade/api/defillama/volume";
const FEES_URL = "https://api.hypemarket.trade/api/defillama/fees";

type Token = { decimals: number; coingeckoId: string | null };
type VolumeDay = { day: string; boughtRaw: string; soldRaw: string; mintedRaw: string };
type FeesDay = { day: string; protocolRevenueRaw: string; supplySideRevenueRaw: string };
type VolumePayload = { token: Token; days: VolumeDay[] };
type FeesPayload = { token: Token; days: FeesDay[] };

// Fetch each full series once per run; per-day fetch() calls read from cache, so the
// backend is hit at most once per series no matter how many days are backfilled.
const cache: { volume?: Promise<VolumePayload>; fees?: Promise<FeesPayload> } = {};
// The API wraps payloads in { data, success }; tolerate both that and a bare body.
const unwrap = (res: any) => res?.data ?? res;
const getVolume = (): Promise<VolumePayload> => (cache.volume ??= httpGet(VOLUME_URL).then(unwrap));
const getFees = (): Promise<FeesPayload> => (cache.fees ??= httpGet(FEES_URL).then(unwrap));

// Raw base units -> whole SUPRA. Surface malformed data as an error rather than
// coercing it to 0 (which would silently write incorrect history).
const toSupra = (token: Token, raw: string | undefined): number => {
  if (raw === undefined) throw new Error("hypemarket: missing amount in API response");
  const amount = Number(raw) / 10 ** token.decimals;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`hypemarket: invalid amount raw=${raw} decimals=${token.decimals}`);
  }
  return amount;
};
const lastDay = (days: { day: string }[]): string | null => (days.length ? days[days.length - 1].day : null);

const fetch = async (options: FetchOptions) => {
  const [vol, fee] = await Promise.all([getVolume(), getFees()]);
  const day = options.dateString;

  // Fail (rather than emit 0) when the day is not yet covered by the backend. The volume
  // series is ordered ascending and refreshed to "today"; a day beyond its latest entry —
  // or an empty series — means data is unavailable, not zero. A day within range with no
  // row is a genuine no-activity day and correctly contributes 0.
  const volLatest = lastDay(vol.days);
  if (!volLatest || day > volLatest) {
    throw new Error(`hypemarket: no data available for ${day}`);
  }

  const vRow = vol.days.find((d) => d.day === day);
  const fRow = fee.days.find((d) => d.day === day);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Each balance is priced by the framework at the day's historical SUPRA price. Every
  // label below matches a key in breakdownMethodology for the same dimension.
  const cgVol = vol.token.coingeckoId || "supra";
  const cgFee = fee.token.coingeckoId || "supra";

  if (vRow) {
    const trades = toSupra(vol.token, vRow.boughtRaw) + toSupra(vol.token, vRow.soldRaw);
    const seed = toSupra(vol.token, vRow.mintedRaw);
    if (trades > 0) dailyVolume.addCGToken(cgVol, trades, "Outcome trades");
    if (seed > 0) dailyVolume.addCGToken(cgVol, seed, "Creation seed");
  }
  if (fRow) {
    const protocol = toSupra(fee.token, fRow.protocolRevenueRaw);
    const supplySide = toSupra(fee.token, fRow.supplySideRevenueRaw);
    // dailyFees = protocol + supply-side (= total fees); dailyRevenue / SupplySide split it.
    if (protocol > 0) {
      dailyFees.addCGToken(cgFee, protocol, "Protocol fee");
      dailyRevenue.addCGToken(cgFee, protocol, "Protocol fee");
    }
    if (supplySide > 0) {
      dailyFees.addCGToken(cgFee, supplySide, "Creator & user fees");
      dailySupplySideRevenue.addCGToken(cgFee, supplySide, "Creator & user fees");
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  // v1: the backend exposes daily aggregates keyed by UTC date (options.dateString),
  // not hourly windows — v1 is the correct model for a daily-aggregate API.
  version: 1,
  fetch,
  chains: [CHAIN.SUPRA],
  // Days within range with no trades correctly return 0; days beyond the computed range
  // throw (unavailable).
  start: "2026-06-08",
  methodology: {
    Volume:
      "Daily trading volume across HypeMarket LS-LMSR prediction markets on Supra — buys + sells of outcome tokens plus market-creation seed liquidity — in native SUPRA priced at each day's SUPRA price. A market's creation seed mints equal shares of every outcome (economically equivalent to buying one of each), so it is counted as volume.",
    Fees:
      "Total trading fees paid by users: creator fee + protocol fee + user fee, charged on each trade's base notional per the on-chain fee schedule.",
    Revenue: "Protocol's share of trading fees (protocol fee).",
    SupplySideRevenue: "Fees accruing to market creators and users (creator + user fees).",
  },
  breakdownMethodology: {
    Volume: {
      "Outcome trades": "Buys and sells of outcome tokens against the LS-LMSR AMM.",
      "Creation seed":
        "Market-creation seed liquidity — equal shares minted across all outcomes (equivalent to buying one of each outcome).",
    },
    Fees: {
      "Protocol fee": "Protocol fee (protocolFeeBps) charged on each trade's base notional.",
      "Creator & user fees":
        "Per-market creator fee (creatorFeeBps) plus user fee (userFeeBps) charged on each trade's base notional.",
    },
    Revenue: {
      "Protocol fee": "Protocol's share of trading fees (protocolFeeBps).",
    },
    SupplySideRevenue: {
      "Creator & user fees": "Fees accruing to market creators and users (creatorFeeBps + userFeeBps).",
    },
  },
};

export default adapter;
