import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

// Pacifica is a Solana perpetuals DEX. It has no endpoint that reports collected
// fees, so we estimate fees from perp volume x the fee rate.
const INFO_URL = "https://api.pacifica.fi/api/v1/info";

// Pacifica's documented base-tier (level 0) fee schedule, from GET
// /api/v1/info/fees. Both sides of every trade pay a positive rate (no maker
// rebate), so a given one-sided notional generates (maker + taker) in fees.
// Hardcoded rather than fetched live so a rate change on Pacifica's side does
// not silently recalculate historical days; higher-volume traders pay lower
// tiered rates, so this base rate is a standard-rate estimate.
const MAKER_FEE_RATE = 0.00015;
const TAKER_FEE_RATE = 0.0004;
const FEE_RATE = MAKER_FEE_RATE + TAKER_FEE_RATE;

const getDailyVolume = async (options: FetchOptions): Promise<number> => {
  // Always use the daily kline bounded to options.startOfDay so the volume
  // covers exactly the requested UTC day and re-running a day is deterministic
  // (a rolling 24h snapshot would mix two dates and drift between runs).
  const info = await fetchURL(INFO_URL);
  if (!info.data) throw new Error("Pacifica: tickers are unavailable, please try again later");
  const perps = info.data
    .filter((instrument: any) => instrument.instrument_type === "perpetual")
    .map((instrument: any) => instrument.symbol);

  let dailyVolume = 0;
  const { errors } = await PromisePool.withConcurrency(1)
    .for(perps)
    .process(async (symbol) => {
      const kline = await fetchURLAutoHandleRateLimit(
        `https://api.pacifica.fi/api/v1/kline?symbol=${symbol}&interval=1d&start_time=${options.startOfDay * 1000}`,
      );
      const day = kline.data.filter((candle: any) => candle.t == options.startOfDay * 1000);
      if (day[0]) dailyVolume += (day[0].v * +day[0].c) / 2; // taker + maker in ohlcv candles
      await new Promise((r) => setTimeout(r, 4000));
    });
  // Fail closed: a dropped market would silently under-report the day.
  if (errors.length) throw new Error(`Pacifica: ${errors.length} kline request(s) failed`);
  return dailyVolume;
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolumeUsd = await getDailyVolume(options);
  const dailyFees = dailyVolumeUsd * FEE_RATE;

  // Only fees are reported. Pacifica pays affiliates a fee-share (a supplier
  // cost) that no public endpoint exposes, so net revenue cannot be measured;
  // reporting gross fees as revenue would overstate it.
  return { dailyFees, dailyUserFees: dailyFees };
};

const methodology = {
  Fees: "Trading fees paid by users on Pacifica's perpetual markets, estimated as daily perp volume multiplied by Pacifica's base-tier fee rate (maker 0.015% + taker 0.04%). Higher-volume traders pay lower tiered rates, so this uses the standard base rate.",
  UserFees: "All trading fees are paid by the traders.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-09', // matches the dexs/pacifica volume adapter
  methodology,
};

export default adapter;
