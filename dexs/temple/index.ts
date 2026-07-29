import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API_BASE_URL = "https://api.templedigitalgroup.com/api/exchange";
const TICKERS_URL = `${API_BASE_URL}/tickers`;
const HISTORICAL_TRADES_URL = `${API_BASE_URL}/historical_trades`;
const PAGE_SIZE = 500;
const USD_QUOTES = new Set(["USDA", "USDCx"]);

// These markets are no longer returned by /tickers, but contain Temple's
// pre-USDA history and must remain queryable for backfills.
const LEGACY_TICKERS = ["CC_USDCx", "CBTC_USDCx"];

type TempleTicker = {
  ticker_id: string;
  target_currency: string;
};

type TempleTrade = {
  trade_id: number;
  target_volume: string;
  trade_timestamp: string;
  settled: boolean;
};

type HistoricalTradesResponse = {
  buy?: TempleTrade[];
  sell?: TempleTrade[];
  has_more: boolean;
  next_cursor?: string;
};

const getTickers = async (): Promise<string[]> => {
  const tickers: TempleTicker[] = await fetchURL(TICKERS_URL);
  if (!Array.isArray(tickers) || tickers.length === 0)
    throw new Error("Temple tickers response empty or malformed");

  const currentTickers = tickers
    .filter((ticker) => USD_QUOTES.has(ticker.target_currency))
    .map((ticker) => ticker.ticker_id);

  return [...new Set([...LEGACY_TICKERS, ...currentTickers])];
};

const getTickerVolume = async (
  tickerID: string,
  startTimestamp: number,
  endTimestamp: number,
  startTime: string,
  endTime: string,
): Promise<number> => {
  let cursor: string | undefined;
  let volume = 0;
  const seenCursors = new Set<string>();
  const seenTradeIDs = new Set<number>();

  do {
    const params = new URLSearchParams({
      ticker_id: tickerID,
      limit: String(PAGE_SIZE),
      settled_only: "true",
      start_time: startTime,
      end_time: endTime,
    });
    if (cursor) params.set("cursor", cursor);

    const response: HistoricalTradesResponse = await fetchURL(
      `${HISTORICAL_TRADES_URL}?${params}`,
    );
    if (!response || typeof response.has_more !== "boolean")
      throw new Error(`Malformed historical trades response for ${tickerID}`);

    for (const trade of [...(response.buy ?? []), ...(response.sell ?? [])]) {
      if (!trade.settled) continue;

      const tradeTimestamp = Number(trade.trade_timestamp);
      if (!Number.isFinite(tradeTimestamp))
        throw new Error(
          `Invalid timestamp for trade ${trade.trade_id}: ${trade.trade_timestamp}`,
        );
      // The API's end_time bound is inclusive; enforce DefiLlama's half-open
      // interval locally so a midnight trade cannot be counted twice.
      if (
        tradeTimestamp < startTimestamp * 1000 ||
        tradeTimestamp >= endTimestamp * 1000
      )
        continue;

      if (seenTradeIDs.has(trade.trade_id))
        throw new Error(`Duplicate historical trade ${trade.trade_id} for ${tickerID}`);
      seenTradeIDs.add(trade.trade_id);

      const targetVolume = Number(trade.target_volume);
      if (!Number.isFinite(targetVolume))
        throw new Error(
          `Invalid target_volume for trade ${trade.trade_id}: ${trade.target_volume}`,
        );
      volume += targetVolume;
    }

    if (response.has_more && !response.next_cursor)
      throw new Error(`Missing next_cursor for paginated ticker ${tickerID}`);
    if (response.next_cursor && seenCursors.has(response.next_cursor))
      throw new Error(`Repeated historical trades cursor for ${tickerID}`);
    if (response.next_cursor) seenCursors.add(response.next_cursor);
    cursor = response.next_cursor;
  } while (cursor);

  return volume;
};

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString();
  const endTime = new Date(options.endTimestamp * 1000).toISOString();
  const tickers = await getTickers();
  const volumes: number[] = [];
  // Keep calls sequential to stay below the public endpoint's anonymous rate
  // limit during backfills; pagination still uses the maximum page size.
  for (const ticker of tickers)
    volumes.push(
      await getTickerVolume(
        ticker,
        options.startTimestamp,
        options.endTimestamp,
        startTime,
        endTime,
      ),
    );

  return { dailyVolume: volumes.reduce((sum, volume) => sum + volume, 0) };
};

const methodology = {
  Volume:
    "Settled spot orderbook volume across Temple markets quoted in the USD-pegged USDA and USDCx assets. Historical trades are fetched for the requested time window, including legacy USDCx markets, and summed using quote-side target_volume.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CANTON],
  start: "2026-01-01",
  // A daily pull keeps backfills bounded to one paginated request set per day.
  pullHourly: false,
  methodology,
};

export default adapter;
