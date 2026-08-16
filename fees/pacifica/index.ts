import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

// Pacifica is a Solana perpetuals DEX. It has no endpoint that reports collected
// fees, but it does publish its fee schedule, so we estimate fees from perp
// volume x the base-tier rate. Volume is derived exactly like dexs/pacifica.
const INFO_URL = "https://api.pacifica.fi/api/v1/info";
const PRICES_URL = "https://api.pacifica.fi/api/v1/info/prices";
const FEES_URL = "https://api.pacifica.fi/api/v1/info/fees";

// Pacifica charges both sides of every trade - the maker and taker rates are
// both positive, there is no rebate - so the fee a given notional generates is
// (maker + taker). We read the base tier (level 0) live; higher-volume traders
// pay lower tiered rates, so this is the standard-rate estimate.
const getBaseFeeRate = async (): Promise<number> => {
  const fees = await fetchURL(FEES_URL);
  const base = fees.data?.find((tier: any) => tier.level === 0);
  if (!base) throw new Error("Pacifica: base fee tier unavailable");
  const makerRate = Number(base.maker_fee_rate);
  const takerRate = Number(base.taker_fee_rate);
  if (!Number.isFinite(makerRate) || !Number.isFinite(takerRate)) {
    throw new Error(`Pacifica: invalid fee schedule (maker=${base.maker_fee_rate}, taker=${base.taker_fee_rate})`);
  }
  return makerRate + takerRate;
};

const getDailyVolume = async (options: FetchOptions): Promise<number> => {
  const todayStartOfDay = Math.floor(Date.now() / 86_400_000) * 86_400;
  // The runner calls us with the just-completed day's startOfDay; rolling 24h
  // from /info/prices is a close match for that window.
  const isRecentDay = options.startOfDay >= todayStartOfDay - 86_400;

  if (isRecentDay) {
    const prices = await fetchURL(PRICES_URL);
    if (!prices.data) throw new Error("Pacifica: prices are unavailable, please try again later");
    // volume_24h counts taker + maker, so /2 gives one-sided notional.
    return prices.data.reduce((acc: number, row: any) => acc + Number(row.volume_24h) / 2, 0);
  }

  const info = await fetchURL(INFO_URL);
  if (!info.data) throw new Error("Pacifica: tickers are unavailable, please try again later");
  const perps = info.data
    .filter((instrument: any) => instrument.instrument_type === "perpetual")
    .map((instrument: any) => instrument.symbol);

  let dailyVolume = 0;
  await PromisePool.withConcurrency(1)
    .for(perps)
    .process(async (symbol) => {
      const kline = await fetchURLAutoHandleRateLimit(
        `https://api.pacifica.fi/api/v1/kline?symbol=${symbol}&interval=1d&start_time=${options.startOfDay * 1000}`,
      );
      const day = kline.data.filter((candle: any) => candle.t == options.startOfDay * 1000);
      if (day[0]) dailyVolume += (day[0].v * +day[0].c) / 2; // taker + maker in ohlcv candles
      await new Promise((r) => setTimeout(r, 4000));
    });
  return dailyVolume;
};

const fetch = async (options: FetchOptions) => {
  const [feeRate, dailyVolumeUsd] = await Promise.all([getBaseFeeRate(), getDailyVolume(options)]);
  const dailyFeesUsd = dailyVolumeUsd * feeRate;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(dailyFeesUsd, METRIC.TRADING_FEES);

  const dailyUserFees = options.createBalances();
  dailyUserFees.addUSDValue(dailyFeesUsd, METRIC.TRADING_FEES);

  // Both sides of every trade pay a positive rate (no maker rebate), so all fees
  // are retained as revenue. Pacifica does not publish the protocol-vs-vault
  // split, so we report the total without breaking it down.
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(dailyFeesUsd, METRIC.TRADING_FEES);

  return { dailyFees, dailyUserFees, dailyRevenue };
};

const methodology = {
  Fees: "Trading fees paid by users on Pacifica's perpetual markets, estimated as daily perp volume multiplied by Pacifica's base-tier fee rate (maker + taker, read live from the public fee schedule). Higher-volume traders pay lower tiered rates, so this uses the standard base rate.",
  UserFees: "All trading fees are paid by the traders.",
  Revenue: "Both the maker and taker rate are positive (no rebate), so all trading fees are retained as revenue.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-09', // matches the dexs/pacifica volume adapter
  methodology,
};

export default adapter;
