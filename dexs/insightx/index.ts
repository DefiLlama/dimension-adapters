import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

/**
 * InsightX Adapter for DefiLlama
 *
 * Platform: Prediction Market (Mantle)
 * Data Source: InsightX Backend API
 *
 * InsightX is a Mantle-native prediction market protocol.
 * All trading volume and fees are on-chain on Mantle.
 * Data is fetched from: https://mainnet-api.insightx.finance/predict/v2/llama/stats
 */

interface InsightXDailyStats {
    date: string;
    volume: number;
    fees: number;
}

const INSIGHTX_API_BASE = "https://mainnet-api.insightx.finance/predict/v2/llama/stats";

const fetch = async (options: FetchOptions) => {
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
  version: 2,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch,
      start: "2026-06-03",
    },
  },
};

export default adapter;
