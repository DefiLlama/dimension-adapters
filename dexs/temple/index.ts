import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API_BASE_URL = "https://api.templedigitalgroup.com/api/exchange";
const SETTLED_VOLUME_URL = `${API_BASE_URL}/settled_volume`;
const TICKERS_URL = `${API_BASE_URL}/tickers`;
const BPS = 10000;

// Temple cut trading fees from maker 10 / taker 15 bps.
const FEE_CUT_DATE = "2026-05-09";
const FEES_BEFORE_CUT = { maker: 10, taker: 15 };
const FEES_AFTER_CUT = { maker: 0.5, taker: 1 };

// settled_volume counts USDA and USDCx at $1 and drops every other quote asset without erroring
const USD_QUOTES = ["USDA", "USDCx"];

type SettledVolumeResponse = {
  start_time: string;
  end_time: string;
  total_volume_usd: number;
};

type Ticker = {
  ticker_id: string;
  target_currency: string;
};

const assertEveryMarketQuotesUSD = async () => {
  const tickers: Ticker[] = await fetchURL(TICKERS_URL);
  const excluded = tickers.filter((t) => !USD_QUOTES.includes(t.target_currency));
  if (excluded.length)
    throw new Error(
      `Temple listed markets settled_volume excludes: ${excluded.map((t) => t.ticker_id).join(", ")}`,
    );
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  await assertEveryMarketQuotesUSD();

  // DefiLlama v2 supplies an inclusive `toTimestamp` and derives
  // `startTimestamp` as end - 1 day - 1 second. The Temple endpoint accepts
  // half-open windows capped at exactly 24 hours, so normalize the lower bound.
  const requestStartTimestamp = options.startTimestamp + 1;
  const startTime = new Date(requestStartTimestamp * 1000).toISOString();
  const endTime = new Date(options.endTimestamp * 1000).toISOString();
  const params = new URLSearchParams({
    start_time: startTime,
    end_time: endTime,
  });
  const response: SettledVolumeResponse = await fetchURL(
    `${SETTLED_VOLUME_URL}?${params}`,
  );
  const dailyVolume = Number(response.total_volume_usd);
  if (
    Date.parse(response.start_time) !== requestStartTimestamp * 1000 ||
    Date.parse(response.end_time) !== options.endTimestamp * 1000 ||
    !Number.isFinite(dailyVolume) ||
    dailyVolume < 0
  )
    throw new Error("Temple settled volume response malformed or mismatched");

  const { maker, taker } =
    options.dateString < FEE_CUT_DATE ? FEES_BEFORE_CUT : FEES_AFTER_CUT;
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(dailyVolume * maker / BPS, "Maker Fees");
  dailyFees.addUSDValue(dailyVolume * taker / BPS, "Taker Fees");

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Volume:
    "Value of every trade settled on Temple's orderbook during the day, counted once per trade. All markets are quoted in USDA or USDCx, both worth one dollar.",
  Fees:
    "1.5 bps of trade value: 0.5 bps from the maker and 1 bp from the taker. Trades before 2026-05-09 use the old 10 bps maker / 15 bps taker rates.",
  UserFees: "Traders pay the entire fee, since both sides of a trade are charged.",
  Revenue: "Temple keeps every trading fee.",
  ProtocolRevenue: "All trading fees go to Temple.",
  SupplySideRevenue:
    "Zero. Both sides pay a fee and none is paid back out, so makers get no share.",
};

const makerFeeMethodology = "Maker side of each trade: 0.5 bps, or 10 bps before 2026-05-09.";
const takerFeeMethodology = "Taker side of each trade: 1 bp, or 15 bps before 2026-05-09.";

const breakdownMethodology = {
  Fees: {
    "Maker Fees": makerFeeMethodology,
    "Taker Fees": takerFeeMethodology,
  },
  UserFees: {
    "Maker Fees": makerFeeMethodology,
    "Taker Fees": takerFeeMethodology,
  },
  Revenue: {
    "Maker Fees": makerFeeMethodology,
    "Taker Fees": takerFeeMethodology,
  },
  ProtocolRevenue: {
    "Maker Fees": makerFeeMethodology,
    "Taker Fees": takerFeeMethodology,
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CANTON],
  start: "2025-12-18",
  // One bounded aggregate request covers each daily backfill window.
  pullHourly: false,
  methodology,
  breakdownMethodology,
};

export default adapter;
