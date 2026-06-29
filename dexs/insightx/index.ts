import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

/**
 * InsightX Adapter for DefiLlama
 * 
 * Platform: Prediction Market
 * Data Source: InsightX Backend API
 * 
 * Displays daily trading volume and protocol fees aggregated by the InsightX backend.
 * Data is fetched from: https://mainnet-api.insightx.finance/predict/v2/llama/stats
 */

interface InsightXDailyStats {
    date: string;
    volume: number;      // Daily trading volume in USD
    fees: number;        // Daily fees in USD
}

const INSIGHTX_API_BASE = "https://mainnet-api.insightx.finance/predict/v2/llama/stats";

/**
 * Fetch daily metrics from InsightX Backend API (Off-Chain)
 * 
 * Returns aggregated trading volume and protocol fees calculated off-chain
 */
const fetchOffChain = async (options: FetchOptions) => {
  const url = `${INSIGHTX_API_BASE}?date=${options.dateString}`;

  const response = await httpGet(url);

  const data: InsightXDailyStats = response;

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  dailyVolume.addUSDValue(data.volume || 0);
  dailyFees.addUSDValue(data.fees || 0);

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  skipBreakdownValidation: true,
  adapter: {
    [CHAIN.OFF_CHAIN]: {
      fetch: fetchOffChain,
      start: "2026-06-03",
    },
  },
};

export default adapter;
