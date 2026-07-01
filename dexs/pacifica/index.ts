import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

// Pacifica base trading fees: 0.0200% taker + 0.0075% maker.
// `dailyVolume` below is the matched notional (Pacifica reports taker + maker volume,
// which we halve), and every matched trade has exactly one taker and one maker, so the
// protocol collects (taker + maker) fee on that notional.
// https://docs.pacifica.fi/trading-on-pacifica/trading-fees
const TAKER_FEE = 0.0002;
const MAKER_FEE = 0.000075;
const TOTAL_FEE_RATE = TAKER_FEE + MAKER_FEE;

const fetch = async (options: FetchOptions) => {
  const todayStartOfDay = Math.floor(Date.now() / 86_400_000) * 86_400;
  // The runner calls us with the just-completed day's startOfDay; rolling 24h
  // from /info/prices is a close match for that window.
  const isRecentDay = options.startOfDay >= todayStartOfDay - 86_400;

  if (isRecentDay) {
    const prices = await fetchURL('https://api.pacifica.fi/api/v1/info/prices');
    if (!prices.data) throw new Error('Prices are unavailable, please try again later');
    let dailyVolume = 0;
    for (const row of prices.data) {
      dailyVolume += (+row.volume_24h/2); // they include taker + maker
    }
    const dailyFees = dailyVolume * TOTAL_FEE_RATE;
    return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  }

  const data = await fetchURL('https://api.pacifica.fi/api/v1/info')
  if (!data.data) {
    throw new Error('Tickers are unavailable, please try again later');
  }

  const tickers = data.data
    .filter((tradeSummary: any) => tradeSummary.instrument_type === 'perpetual')
    .map((tradeSummary: any) => tradeSummary.symbol)
  let dailyVolume = 0;

  await PromisePool.withConcurrency(1)
    .for(tickers)
    .process(async (ticker) => {
      const data = await fetchURLAutoHandleRateLimit(`https://api.pacifica.fi/api/v1/kline?symbol=${ticker}&interval=1d&start_time=${(options.startOfDay) * 1000}`)
      const todaysData = data.data.filter((kline: any) => kline.t == options.startOfDay * 1000);
      const volume = (todaysData[0].v * +todaysData[0].c) / 2; // They include taker + maker in ohlcv candles
      dailyVolume += volume;
      await new Promise(r => setTimeout(r, 4000));
    })

  const dailyFees = dailyVolume * TOTAL_FEE_RATE;
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-09',
  methodology: {
    Volume: "Notional volume of perpetual trades on Pacifica, taken from the public API (taker + maker volume, halved to matched notional).",
    Fees: "Trading fees paid by users: 0.0200% taker + 0.0075% maker on matched notional.",
    Revenue: "All trading fees are collected by the protocol.",
    ProtocolRevenue: "All trading fees are collected by the protocol.",
  },
}

export default adapter;
