import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

/**
 * The stats API is the backend for the official Hyperliquid stats frontend.
 * This API does not generate data in real-time. It serves data from a PostgreSQL database
 * which is populated by a backend process that downloads historical data from a private AWS S3 archive.
 *
 * The Hyperliquid team only updates this S3 archive approximately once per month.
 * This is the source of the significant data lag.
 * Source: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/historical-data
 *
 * The stats API endpoint URL was discovered by inspecting the official frontend's network traffic.
 * Frontend source code: https://github.com/hyperliquid-dex/hyperliquid-stats-web
 * Backend source code: https://github.com/hyperliquid-dex/hyperliquid-stats
 */
const HYPERLIQUID_STATS_API = "https://d2v1fiwobg9w6.cloudfront.net";

interface PnlResponse {
  chart_data: {
    time: string;
    total_pnl: number;
  }[];
}

interface VolumeResponse {
  chart_data: {
    time: string;
    coin: string;
    total_volume: number;
  }[];
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp } = options;

  // There are two compounding off-by-one-day errors that we must correct for:
  // 1. DefiLlama provides the timestamp for the PREVIOUS day (D-1).
  // 2. The Hyperliquid stats API returns data for the PREVIOUS day (D-1).
  // Therefore, to get data for the date requested for date (D), we receive a timestamp for D-1
  // and need to query the API for D+1. This requires adding two full days to the received timestamp.
  const adjustedTimestamp = startTimestamp + 172800; // 86400 * 2, which is the number of seconds in 48 hours.
  const targetDateString = new Date(adjustedTimestamp * 1000).toISOString().split('T')[0];

  const volumeResponse: VolumeResponse = await httpGet(`${HYPERLIQUID_STATS_API}/total_volume`);
  const dailyVolume = volumeResponse.chart_data
    .filter(item => item.time.split('T')[0] === targetDateString)
    .reduce((sum, item) => sum + item.total_volume, 0);

  const pnlResponse: PnlResponse = await httpGet(`${HYPERLIQUID_STATS_API}/user_pnl`);
  const pnlData = pnlResponse.chart_data;
  
  const dayPnlData = pnlData.find(item => item.time.split('T')[0] === targetDateString);
  
  const now = Math.floor(Date.now() / 1000);
  if (!dayPnlData && startTimestamp > (now - 3 * 86400) && startTimestamp < now) {
    const latestDate = pnlData.length > 0 ? pnlData[pnlData.length - 1].time.split('T')[0] : "N/A";
    throw new Error(`Hyperliquid fee data is stale. Latest available date from API is ${latestDate}, but you requested ${targetDateString}.`);
  }
  
  const protocolRevenue = dayPnlData ? -1 * dayPnlData.total_pnl : 0;
  
  // dailyFees represents the total cost paid by traders and cannot be negative unless the traders were profitable,
  // in which case they pay no fee, so we floor it at 0.
  const dailyFees = Math.max(0, protocolRevenue);
  // dailyRevenue is the portion of fees kept by the protocol. It can be negative if traders were profitable.
  // However, DefiLlama throws an error on negative revenue, so we floor it at 0.
  const dailyRevenue = Math.max(0, protocolRevenue);

  return {
    dailyVolume: dailyVolume.toString(),
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
    dailySupplySideRevenue: "0", // The HLP is the protocol, so no revenue is distributed to external suppliers
    timestamp: startTimestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    dailyVolume: "Calculated by summing the 'total_volume' from all markets for a given day from the `/total_volume` endpoint of Hyperliquid's official stats API.",
    dailyFees: "Calculated as the inverse of the daily net Profit and Loss (PnL) of all traders, sourced from the `/user_pnl` endpoint. This value is floored at zero, as fees paid by users cannot be negative.",
    dailyRevenue: "Represents the protocol's net income. It is calculated as the inverse of the traders' PnL. This value is floored at zero to comply with DefiLlama's test runner, although it can technically be negative on days when traders are profitable.",
    dailySupplySideRevenue: "There is no supply-side revenue, as the Hyperliquid Liquidity Provider (HLP) is the protocol itself and not an external liquidity provider."
  },
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-03-05',
    },
  }
};

export default adapter;