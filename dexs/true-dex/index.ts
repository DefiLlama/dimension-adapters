import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// TRUE DEX: perpetuals venue (https://app.truefinance.ai/perps). Trades match
// on an off-chain sequencer; only ZK-verified block roots settle on Solana
// (verifier ttaiNybR4ncnBFsBCQKdVus8BNHepErToRp5cuULduL), so individual
// trades are not Solana transactions and the volume is listed as off-chain.
// Daily aggregates come from the project's public per-UTC-day endpoint, built
// from the venue trade tape (one row per venue trade id); the same tape backs
// the live https://dex-prod.truefinance.ai/v1/markets/stats volume_24h figure.
const STATS_URL = "https://app.truefinance.ai/api/public/dex/stats";

interface DayStats {
  date: string;
  volumeUsd: number;
  feesUsd: number;
  trades: number;
  complete: boolean;
}

const fetch = async (options: FetchOptions) => {
  const data: DayStats = await httpGet(`${STATS_URL}?date=${options.dateString}`);
  if (!data || data.date !== options.dateString) {
    throw new Error(`TRUE DEX: no stats for ${options.dateString}`);
  }

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Taker volume only: one venue trade = one taker fill, both sides counted once.
  dailyVolume.addUSDValue(data.volumeUsd);
  // Per-market taker fee (fee_config.taker_fee_ppm, 0.1% on most markets) on
  // that market's volume. Maker fees (0.02%) are excluded.
  dailyFees.addUSDValue(data.feesUsd, "Perp Trading Fees");
  dailyRevenue.addUSDValue(data.feesUsd, "Perp Trading Fees");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "Taker volume of all perpetual fills on the TRUE DEX venue (one fill counted once), summed per UTC day from the venue trade tape.",
  Fees: "Taker trading fees: each market's taker_fee_ppm (0.1% on most markets) applied to that market's volume. Maker fees are not charged to takers and are excluded.",
  Revenue: "All trading fees are collected by the protocol. Partner commissions and trader fee rebates are paid from the treasury after the fact and are not netted here.",
  ProtocolRevenue: "Same as Revenue: the protocol treasury receives all trading fees.",
};

const breakdownMethodology = {
  Fees: {
    "Perp Trading Fees": "Taker fees on perpetual fills.",
  },
  Revenue: {
    "Perp Trading Fees": "Taker fees on perpetual fills, kept by the protocol treasury.",
  },
  ProtocolRevenue: {
    "Perp Trading Fees": "Taker fees on perpetual fills, kept by the protocol treasury.",
  },
};

const adapter: SimpleAdapter = {
  // version 1: the project endpoint returns per-UTC-day aggregates only.
  version: 1,
  fetch,
  // Trades are not Solana transactions (see header); collateral custody is on
  // Solana and is covered by the TVL adapter.
  chains: [CHAIN.OFF_CHAIN],
  // First UTC day covered by the venue trade tape.
  start: "2026-08-23",
  methodology,
  breakdownMethodology,
};

export default adapter;
