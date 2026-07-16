import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const TICKERS_URL = "https://api.templedigitalgroup.com/api/exchange/tickers";

// Temple CLOB trading fees: maker 1 bps + taker 2 bps = 3 bps per matched notional, all retained by the protocol.
const FEE_RATE = (1 + 2) / 10000;

type TempleTicker = {
  ticker_id: string;
  base_currency: string;
  target_currency: string;
  target_volume: string;
};

const fetch = async (_options: FetchOptions): Promise<FetchResult> => {
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

  const dailyFees = dailyVolume * FEE_RATE;

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
  Revenue: "All trading fees are retained by the protocol; there is no fee rebate to market makers.",
  ProtocolRevenue: "Same as Revenue — the full 3 bps of volume is retained by Temple.",
  SupplySideRevenue:
    "Zero. No trading-fee share is paid to liquidity providers or market makers; the monthly Canton Coin leaderboard is a separately-funded incentive, not a fee redistribution.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CANTON],
  runAtCurrTime: true,
  methodology,
};

export default adapter;
