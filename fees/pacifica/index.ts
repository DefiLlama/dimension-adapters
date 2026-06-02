import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

// Base fee tier (most users). Higher tiers have lower rates.
const TAKER_FEE = 0.0004;
const MAKER_FEE = 0.00015;
const BLENDED_FEE = TAKER_FEE + MAKER_FEE;

async function fetchDailyVolume(options: FetchOptions): Promise<number> {
  const todayStartOfDay = Math.floor(Date.now() / 86_400_000) * 86_400;
  const isRecentDay = options.startOfDay >= todayStartOfDay - 86_400;

  if (isRecentDay) {
    const prices = await fetchURL("https://api.pacifica.fi/api/v1/info/prices");
    if (!prices.data) throw new Error("Prices are unavailable");
    let volume = 0;
    for (const row of prices.data) {
      volume += +row.volume_24h / 2; // API counts both maker + taker sides
    }
    return volume;
  }

  const data = await fetchURL("https://api.pacifica.fi/api/v1/info");
  if (!data.data) throw new Error("Tickers are unavailable");

  const tickers = data.data
    .filter((t: any) => t.instrument_type === "perpetual")
    .map((t: any) => t.symbol);

  let volume = 0;
  await PromisePool.withConcurrency(1)
    .for(tickers)
    .process(async (ticker) => {
      const res = await fetchURLAutoHandleRateLimit(
        `https://api.pacifica.fi/api/v1/kline?symbol=${ticker}&interval=1d&start_time=${options.startOfDay * 1000}`
      );
      const candle = res.data.find((k: any) => k.t === options.startOfDay * 1000);
      if (candle) volume += (candle.v * +candle.c) / 2;
      await new Promise((r) => setTimeout(r, 4000));
    });

  return volume;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = await fetchDailyVolume(options);
  const fees = dailyVolume * BLENDED_FEE;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const methodology = {
  Fees:
    "Trading fees on all perpetual and spot trades.",
  Revenue:
    "All trading fees are retained by the protocol (orderbook DEX, no LP share).",
};


const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2025-06-09",
  chains: [CHAIN.SOLANA],
  methodology,
};

export default adapter;
