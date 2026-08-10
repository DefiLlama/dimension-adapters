import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

// HypeMarket DefiLlama feeds, per UTC day, in raw SUPRA base units. SUPRA-only.
const VOLUME_URL = "https://api.hypemarket.trade/api/defillama/volume";
const FEES_URL = "https://api.hypemarket.trade/api/defillama/fees";

type Token = { decimals: number; coingeckoId: string | null };
type VolumeDay = { day: string; boughtRaw: string; soldRaw: string; mintedRaw: string };
type FeesDay = { day: string; protocolRevenueRaw: string; supplySideRevenueRaw: string };

// The API wraps payloads in { data, success }; tolerate both that and a bare body.
const unwrap = (res: any) => res?.data ?? res;

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
  const [vol, fee] = await Promise.all([fetchURL(VOLUME_URL).then(unwrap), fetchURL(FEES_URL).then(unwrap)]);
  const day = options.dateString;

  // Both feeds return a contiguous, zero-filled daily series up to the latest computed day
  // (a no-activity day like a quiet weekend is present with all-zero values). A day beyond
  // either series' latest entry means data is not computed yet — fail rather than report 0.
  const volLatest = lastDay(vol.days);
  const feeLatest = lastDay(fee.days);

  if (!volLatest || !feeLatest || day > volLatest || day > feeLatest) {
    throw new Error(`hypemarket: no data available for ${day}`);
  }

  const vRow: VolumeDay | undefined = vol.days.find((d: any) => d.day === day);
  const fRow: FeesDay | undefined = fee.days.find((d: any) => d.day === day);
  // Within the covered range the two feeds are aligned day-for-day. A day present in one
  // but not the other means the volume/fee snapshots are momentarily out of sync — fail
  // rather than write an inconsistent day (e.g. volume with no fees).
  if (Boolean(vRow) !== Boolean(fRow)) {
    throw new Error(`hypemarket: inconsistent day rows for ${day} (snapshots may be lagging)`);
  }

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Each balance is priced by the framework at the day's historical SUPRA price. Every
  // label matches a key in breakdownMethodology for the same dimension. A zero-activity
  // day adds nothing and correctly reports 0 for every metric.
  const cgVol = vol.token.coingeckoId || "supra";
  const cgFee = fee.token.coingeckoId || "supra";

  if (vRow) {
    const trades = toSupra(vol.token, vRow.boughtRaw) + toSupra(vol.token, vRow.soldRaw);
    const seed = toSupra(vol.token, vRow.mintedRaw);
    if (trades > 0) dailyVolume.addCGToken(cgVol, trades);
    if (seed > 0) dailyVolume.addCGToken(cgVol, seed);
  }
  if (fRow) {
    const protocol = toSupra(fee.token, fRow.protocolRevenueRaw);
    const supplySide = toSupra(fee.token, fRow.supplySideRevenueRaw);
    // dailyFees = protocol + supply-side (= total fees); dailyRevenue / SupplySide split it.
    if (protocol > 0) {
      dailyFees.addCGToken(cgFee, protocol, METRIC.TRADING_FEES);
      dailyRevenue.addCGToken(cgFee, protocol, "Trading Fees to Protocol");
    }
    if (supplySide > 0) {
      dailyFees.addCGToken(cgFee, supplySide, METRIC.TRADING_FEES);
      dailySupplySideRevenue.addCGToken(cgFee, supplySide, "Trading Fees to Creators and Users");
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
  start: "2026-06-04",
  methodology: {
    Volume:
      "Daily trading volume across HypeMarket LS-LMSR prediction markets on Supra — buys + sells of outcome tokens plus market-creation seed liquidity — in native SUPRA priced at each day's SUPRA price. A market's creation seed mints equal shares of every outcome (economically equivalent to buying one of each), so it is counted as volume.",
    Fees:
      "Total trading fees paid by users: creator fee + protocol fee + user fee, charged on each trade's base notional per the on-chain fee schedule.",
    Revenue: "Protocol's share of trading fees (protocol fee).",
    SupplySideRevenue: "Fees accruing to market creators and users (creator + user fees).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Trading fees charged on each trade's base notional.",
    },
    Revenue: {
      'Trading Fees to Protocol': "Protocol's share of trading fees (protocolFeeBps).",
    },
    SupplySideRevenue: {
      'Trading Fees to Creators and Users': "Fees accruing to market creators and users (creatorFeeBps + userFeeBps).",
    },
  },
};

export default adapter;
