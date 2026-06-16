import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// HypeMarket DefiLlama feeds, per UTC day, in raw SUPRA base units. SUPRA-only.
const VOLUME_URL = "https://api.hypemarket.trade/api/defillama/volume";
const FEES_URL = "https://api.hypemarket.trade/api/defillama/fees";

type Token = { decimals: number; coingeckoId: string | null };
type VolumeDay = { day: string; volumeRaw: string };
type FeesDay = { day: string; feesRaw: string; protocolRevenueRaw: string; supplySideRevenueRaw: string };
type VolumePayload = { token: Token; days: VolumeDay[] };
type FeesPayload = { token: Token; days: FeesDay[] };

// Fetch each full series once per run; per-day fetch() calls read from cache, so the
// backend is hit at most once per series no matter how many days are backfilled.
const cache: { volume?: Promise<VolumePayload>; fees?: Promise<FeesPayload> } = {};
// The API wraps payloads in { data, success }; tolerate both that and a bare body.
const unwrap = (res: any) => res?.data ?? res;
const getVolume = (): Promise<VolumePayload> => (cache.volume ??= httpGet(VOLUME_URL).then(unwrap));
const getFees = (): Promise<FeesPayload> => (cache.fees ??= httpGet(FEES_URL).then(unwrap));

const toSupra = (token: Token, raw: string | undefined): number => {
  const amount = Number(raw) / 10 ** token.decimals; // raw base units -> whole SUPRA
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};
// Priced by the framework at the day's historical SUPRA price via the CoinGecko id.
const add = (bag: any, token: Token, amount: number) => {
  if (amount > 0) bag.addCGToken(token.coingeckoId || "supra", amount);
};

const lastDay = (days: { day: string }[]): string | null => (days.length ? days[days.length - 1].day : null);

const fetch = async (options: FetchOptions) => {
  const [vol, fee] = await Promise.all([getVolume(), getFees()]);
  const day = options.dateString;

  // Fail (rather than emit 0) when the day is not yet covered by the backend. The volume
  // series is the superset of active days, ordered ascending, refreshed to "today"; a day
  // beyond its latest entry — or an empty series — means data is unavailable, not zero.
  // A day *within* the covered range that is simply missing is a genuine no-activity day
  // and correctly contributes 0 (volume and fees series can legitimately differ, e.g. a
  // market-creation-only day has volume rows but no fee row).
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

  // Volume = buys + sells + market-creation seed. The seed mints equal shares of every
  // outcome (economically: buying one of each outcome), so it is counted as volume.
  if (vRow) add(dailyVolume, vol.token, toSupra(vol.token, vRow.volumeRaw));
  if (fRow) {
    add(dailyFees, fee.token, toSupra(fee.token, fRow.feesRaw)); // total fees paid by users
    add(dailyRevenue, fee.token, toSupra(fee.token, fRow.protocolRevenueRaw)); // protocol's cut
    add(dailySupplySideRevenue, fee.token, toSupra(fee.token, fRow.supplySideRevenueRaw)); // creator + user fees
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUPRA],
  // Days within range with no trades correctly return 0; days beyond the computed range
  // throw (unavailable).
  start: "2026-06-08",
  methodology: {
    Volume:
      "Daily trading volume across HypeMarket LS-LMSR prediction markets on Supra — buys + sells of outcome tokens plus market-creation seed liquidity — in native SUPRA priced at each day's SUPRA price. A market's creation seed is allocated evenly across all outcome tokens, which is economically equivalent to simultaneously buying one of every outcome, so it is counted as volume (matching the platform's reported total).",
    Fees:
      "Total trading fees paid by users (creator + protocol + user fees), derived from the on-chain fee schedule: fee = (creatorFeeBps + protocolFeeBps + userFeeBps)/1e4 of each trade's base notional.",
    Revenue: "Protocol's share of trading fees (protocol fee).",
    SupplySideRevenue: "Fees accruing to market creators and users (creator + user fees).",
  },
  breakdownMethodology: {
    Volume: {
      "Outcome trades": "Buys and sells of outcome tokens against the LS-LMSR AMM.",
      "Creation seed": "Market-creation seed liquidity — equal shares minted across all outcomes (equivalent to buying one of each outcome).",
    },
    Fees: {
      "Creator fees": "Per-market creator fee (creatorFeeBps) charged on each trade's base notional.",
      "Protocol fee": "Protocol fee (protocolFeeBps) charged on each trade's base notional.",
      "User fees": "User fee (userFeeBps) charged on each trade's base notional.",
    },
    Revenue: {
      "Protocol fee": "Protocol's share of trading fees (protocolFeeBps).",
    },
    SupplySideRevenue: {
      "Creator fees": "Fees paid to market creators (creatorFeeBps).",
      "User fees": "Fees accruing to users (userFeeBps).",
    },
  },
};

export default adapter;
