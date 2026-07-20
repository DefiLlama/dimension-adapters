import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const TICKERS_URL = "https://api.templedigitalgroup.com/api/exchange/tickers";

const MAKER_FEE_BPS = 1;
const TAKER_FEE_BPS = 2;
const BPS = 10000;

type TempleTicker = {
  ticker_id: string;
  base_currency: string;
  target_currency: string;
  target_volume: string;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const tickers: TempleTicker[] = await fetchURL(TICKERS_URL);
  if (!Array.isArray(tickers) || tickers.length === 0)
    throw new Error("Temple tickers response empty or malformed");

  const dailyVolume = tickers.reduce((sum, ticker) => {
    if (ticker.target_currency !== "USDA")
      throw new Error(`Unexpected non-USDA quote for ticker ${ticker.ticker_id}: ${ticker.target_currency}`);

    const volume = Number(ticker.target_volume);
    if (!Number.isFinite(volume))
      throw new Error(`Invalid target_volume for ticker ${ticker.ticker_id}: ${ticker.target_volume}`);

    return sum + volume;
  }, 0);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(dailyVolume * MAKER_FEE_BPS / BPS, "Maker Fees")
  dailyFees.addUSDValue(dailyVolume * TAKER_FEE_BPS / BPS, "Taker Fees")

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Volume:
    "24h spot orderbook volume across all USDA-quoted Temple markets, summing each ticker's quote-side target_volume from Temple's public exchange-listing API. USDA is a fiat-backed 1:1 USD stablecoin, so quote volume is treated as USD; non-USDA markets are rejected.",
  Fees: "Trading fees charged by the Temple orderbook: 1 bps maker + 2 bps taker = 3 bps applied to daily volume.",
  Revenue: "All trading fees (1 bps maker + 2 bps taker) are retained by the protocol; there is no fee rebate to market makers.",
  ProtocolRevenue: "All trading fees (1 bps maker + 2 bps taker) are retained by the protocol; there is no fee rebate to market makers.",
  SupplySideRevenue:
    "Zero. No trading-fee share is paid to liquidity providers or market makers; the monthly Canton Coin leaderboard is a separately-funded incentive, not a fee redistribution.",
};

const breakdownMethodology = {
  Fees: {
    "Maker Fees": "1 bps maker fee applied to daily volume.",
    "Taker Fees": "2 bps taker fee applied to daily volume.",
  },
  Revenue: {
    "Maker Fees": "1 bps maker fee applied to daily volume.",
    "Taker Fees": "2 bps taker fee applied to daily volume.",
  },
  ProtocolRevenue: {
    "Maker Fees": "1 bps maker fee applied to daily volume.",
    "Taker Fees": "2 bps taker fee applied to daily volume.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CANTON],
  runAtCurrTime: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
