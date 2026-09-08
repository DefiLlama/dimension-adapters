import type { Balances } from "@defillama/sdk";
import type { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

// Native Core CLOB fees — same listing slug as `dexs/native-core`.
// Public stats: GET /api/v3/stats/window (https://api-ui.native.org)
//   from/to: unix seconds on exact hour boundaries, half-open [from, to)
//   35-day rolling coverage; a window past coverage_end is 404, never a zero.
// Maker and taker each pay independently; the protocol keeps 100%.
const STATS_WINDOW_URL = "https://api-ui.native.org/api/v3/stats/window";
const TICKERS_URL = "https://api-ui.native.org/api/v3/cg/tickers";
const HOUR = 3600;
const USD_QUOTES = new Set(["USDC", "USDT"]);

const MAKER_FEES = "Maker Fees";
const TAKER_FEES = "Taker Fees";
const MAKER_TO_TREASURY = "Maker Fees To Treasury";
const TAKER_TO_TREASURY = "Taker Fees To Treasury";

// CoinGecko slugs for assets DefiLlama already prices. Everything else is
// converted through a USDC/USDT CLOB last price from /cg/tickers.
const CG_IDS: Record<string, string> = {
  USDC: "usd-coin",
  USDT: "tether",
  ETH: "ethereum",
  BNB: "binancecoin",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  cbBTC: "coinbase-wrapped-btc",
  USDE: "ethena-usde",
  wstETH: "wrapped-steth",
  SOL: "solana",
  PAXG: "pax-gold",
  XAUt: "tether-gold",
  CASHCAT: "cash-cat"
};

type FeeRow = {
  symbol: string;
  maker: string;
  taker: string;
};

type StatsWindow = {
  from: number;
  to: number;
  stale?: boolean;
  unpriced_trades?: number;
  fees?: FeeRow[] | null;
};

type CgTicker = {
  base_currency: string;
  target_currency: string;
  last_price: string;
};

type VenuePrice = { cgId: string; price: number };

function hourWindow(endTimestamp: number): { from: number; to: number } {
  // FetchOptions.startTimestamp is (end - window - 1s). Flooring that would
  // request the previous hour; Native rejects any from/to not on an hour mark.
  const to = Math.ceil(endTimestamp / HOUR) * HOUR;
  return { from: to - HOUR, to };
}

function parseAmount(raw: string, symbol: string, side: string): number {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Native Core ${side} fee for ${symbol} is invalid: ${raw}`);
  }
  return amount;
}

let venuePrices: Map<string, VenuePrice> | undefined;

async function getVenuePrices(): Promise<Map<string, VenuePrice>> {
  if (venuePrices) return venuePrices;

  const tickers: CgTicker[] = await fetchURLAutoHandleRateLimit(TICKERS_URL);
  const prices = new Map<string, VenuePrice>([
    ["USDC", { cgId: "usd-coin", price: 1 }],
    ["USDT", { cgId: "tether", price: 1 }],
  ]);

  for (const ticker of tickers ?? []) {
    if (!USD_QUOTES.has(ticker.target_currency)) continue;
    const price = Number(ticker.last_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const existing = prices.get(ticker.base_currency);
    if (existing?.cgId === "usd-coin") continue;
    prices.set(ticker.base_currency, {
      cgId: ticker.target_currency === "USDC" ? "usd-coin" : "tether",
      price,
    });
  }

  venuePrices = prices;
  return prices;
}

async function addFee(
  balances: Balances,
  symbol: string,
  amount: number,
  label: string,
): Promise<void> {
  if (amount === 0) return;

  const cgId = CG_IDS[symbol];
  if (cgId) {
    balances.addCGToken(cgId, amount, label);
    return;
  }

  const venue = (await getVenuePrices()).get(symbol);
  if (!venue) {
    throw new Error(
      `Native Core fee asset ${symbol} has no CoinGecko id and no USDC/USDT CLOB price`,
    );
  }
  balances.addCGToken(venue.cgId, amount * venue.price, label);
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { from, to } = hourWindow(options.endTimestamp);
  const snap: StatsWindow = await fetchURLAutoHandleRateLimit(
    `${STATS_WINDOW_URL}?from=${from}&to=${to}`,
  );

  if (snap.unpriced_trades) {
    options.api.log(
      `Native Core stats window [${from}, ${to}) has ${snap.unpriced_trades} unpriced trades`,
    );
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  for (const row of snap.fees ?? []) {
    const maker = parseAmount(row.maker, row.symbol, "maker");
    const taker = parseAmount(row.taker, row.symbol, "taker");
    await addFee(dailyFees, row.symbol, maker, MAKER_FEES);
    await addFee(dailyFees, row.symbol, taker, TAKER_FEES);
    await addFee(dailyRevenue, row.symbol, maker, MAKER_TO_TREASURY);
    await addFee(dailyRevenue, row.symbol, taker, TAKER_TO_TREASURY);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: 0, // protocol keeps 100% of maker and taker fees
  };
};

const methodology = {
  Fees:
    "Maker and taker trading fees on Native Core CLOB fills. Each side pays independently, so both legs are counted. Taken from GET /api/v3/stats/window over the hour. Assets without a CoinGecko id are converted through the venue USDC/USDT last price.",
  UserFees: "Same as fees — traders pay both the maker and taker legs.",
  Revenue: "Native keeps 100% of maker and taker fees. Nothing is paid to LPs.",
  ProtocolRevenue: "Native keeps 100% of maker and taker fees. Nothing is paid to LPs.",
  SupplySideRevenue: "Always zero. Native Core does not share trading fees with the supply side.",
};

const breakdownMethodology = {
  Fees: {
    [MAKER_FEES]: "Trading fees paid by the maker leg of each fill.",
    [TAKER_FEES]: "Trading fees paid by the taker leg of each fill.",
  },
  UserFees: {
    [MAKER_FEES]: "Trading fees paid by the maker leg of each fill.",
    [TAKER_FEES]: "Trading fees paid by the taker leg of each fill.",
  },
  Revenue: {
    [MAKER_TO_TREASURY]: "Maker fees kept by Native.",
    [TAKER_TO_TREASURY]: "Taker fees kept by Native.",
  },
  ProtocolRevenue: {
    [MAKER_TO_TREASURY]: "Maker fees kept by Native.",
    [TAKER_TO_TREASURY]: "Taker fees kept by Native.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.NATIVE_CORE],
  // Public /stats coverage is a 35-day rolling window; Native Core itself launched 2026-05-19.
  start: "2026-07-30",
  methodology,
  breakdownMethodology,
};

export default adapter;
