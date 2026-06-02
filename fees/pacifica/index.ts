import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

// Pacifica fee tiers: volume thresholds and taker/maker rates.
const FEE_TIERS = [
  { threshold: 500_000_000, maker: 0.00000, taker: 0.00028 }, // VIP 3
  { threshold: 250_000_000, maker: 0.00000, taker: 0.00029 }, // VIP 2
  { threshold: 100_000_000, maker: 0.00000, taker: 0.00030 }, // VIP 1
  { threshold: 50_000_000,  maker: 0.00003, taker: 0.00032 }, // Tier 5
  { threshold: 25_000_000,  maker: 0.00006, taker: 0.00034 }, // Tier 4
  { threshold: 10_000_000,  maker: 0.00009, taker: 0.00036 }, // Tier 3
  { threshold: 5_000_000,   maker: 0.00012, taker: 0.00038 }, // Tier 2
  { threshold: 0,           maker: 0.00015, taker: 0.00040 }, // Tier 1
];

// Estimate blended fee rate by distributing 14-day rolling volume across tiers
// from bottom (Tier 1) up. Each tier absorbs volume in its range at that tier's
// combined maker+taker rate. Volume above $500M uses VIP 3 rate.
function estimateBlendedRate(dailyVolume: number): number {
  const rolling = dailyVolume * 14;
  if (rolling <= 0) return FEE_TIERS[FEE_TIERS.length - 1].taker;

  // Fill tiers ascending: Tier 1 ($0-$5M), Tier 2 ($5M-$10M), ... VIP 3 ($500M+)
  const tiers = [...FEE_TIERS].reverse();
  let totalFees = 0;
  let filled = 0;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const upperBound = i + 1 < tiers.length ? tiers[i + 1].threshold : Infinity;
    const capacity = upperBound - tier.threshold;
    const inTier = Math.min(rolling - filled, capacity);
    if (inTier <= 0) break;
    totalFees += inTier * (tier.taker + tier.maker);
    filled += inTier;
  }

  return totalFees / rolling;
}

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
  const blendedRate = estimateBlendedRate(dailyVolume);
  const fees = dailyVolume * blendedRate;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const methodology = {
  Fees:
    "Trading fees estimated from daily notional volume × tier-weighted blended rate derived from Pacifica's 8-tier fee schedule.",
  Revenue:
    "All trading fees retained by the protocol. Pacifica runs a selective affiliate program too (up to 40% fee share on referred trades).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "Trading fees (maker + taker) on perpetual trades, estimated from volume and tier-weighted blended rate.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading fees retained by protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2025-06-09",
  chains: [CHAIN.SOLANA],
  methodology,
  breakdownMethodology,
};

export default adapter;
