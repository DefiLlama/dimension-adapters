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

// Raw base units -> whole SUPRA, added to a balances bag and priced by the framework
// at the day's historical SUPRA price via the CoinGecko id.
const addSupra = (bag: any, token: Token, raw: string | undefined) => {
  const amount = Number(raw) / 10 ** token.decimals;
  if (Number.isFinite(amount) && amount > 0) bag.addCGToken(token.coingeckoId || "supra", amount);
};

const fetch = async (options: FetchOptions) => {
  const [vol, fee] = await Promise.all([getVolume(), getFees()]);
  const day = options.dateString;
  const vRow = (vol.days || []).find((d) => d.day === day);
  const fRow = (fee.days || []).find((d) => d.day === day);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (vRow) addSupra(dailyVolume, vol.token, vRow.volumeRaw);
  if (fRow) {
    addSupra(dailyFees, fee.token, fRow.feesRaw);
    addSupra(dailyRevenue, fee.token, fRow.protocolRevenueRaw); // protocol's cut
    addSupra(dailySupplySideRevenue, fee.token, fRow.supplySideRevenueRaw); // creator + user fees
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SUPRA],
  // HypeMarket's first activity day (per /defillama/volume). Empty days harmlessly
  // return 0, so an earlier start is safe.
  start: "2026-06-04",
  methodology: {
    Volume:
      "Daily notional collateral traded — buys + sells + market-creation liquidity mints — across HypeMarket LS-LMSR prediction markets on Supra, in native SUPRA priced at each day's SUPRA price. Matches the platform's reported total volume.",
    Fees:
      "Total trading fees paid by users (creator + protocol + user fees), derived from the on-chain fee schedule: fee = (creatorFeeBps + protocolFeeBps + userFeeBps)/1e4 of each trade's base notional.",
    Revenue: "Protocol's share of trading fees (protocol fee).",
    SupplySideRevenue: "Fees accruing to market creators and users (creator + user fees).",
  },
};

export default adapter;
