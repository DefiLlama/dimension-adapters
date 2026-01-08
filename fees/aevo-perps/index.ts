import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

interface IAevoPerpVolumeResponse {
  daily_volume: string;
  total_volume: string;
}

interface IAevoPerpFeesResponse {
  timestamp: number;
  dailyFees: number;
  dailyRevenue: number;
  dailyProtocolRevenue: number;
  dailyVolume: string;
  dailyNotionalVolume: string;
}

/**
 * Aevo Perpetuals Fee Structure:
 * - Taker Fee Rate: 0.08% (0.0008)
 * - Maker Fee Rate: 0.05% (0.0005)
 * - Volume Split: 50% taker, 50% maker (typical market assumption)
 * - No caps applied to perpetuals fees
 * 
 * Fee Calculation: (Volume * 0.5 * 0.0008) + (Volume * 0.5 * 0.0005)
 */

// Perpetuals-specific fee rates
const PERP_TAKER_FEE_RATE = 0.0008; // 0.08%
const PERP_MAKER_FEE_RATE = 0.0005; // 0.05%
const TAKER_VOLUME_SPLIT = 0.5;
const MAKER_VOLUME_SPLIT = 0.5;

/**
 * Calculate perpetuals fees from daily volume
 * @param volume - Daily notional volume
 * @param takerFeeRate - Taker fee rate (default: 0.08%)
 * @param makerFeeRate - Maker fee rate (default: 0.05%)
 * @returns Object containing total, taker, and maker fees
 */
function calculatePerpFeesFromVolume(
  volume: number,
  takerFeeRate: number = PERP_TAKER_FEE_RATE,
  makerFeeRate: number = PERP_MAKER_FEE_RATE
): {
  totalFees: number;
} {
  const takerVolume = volume * TAKER_VOLUME_SPLIT;
  const makerVolume = volume * MAKER_VOLUME_SPLIT;

  const takerFees = takerVolume * takerFeeRate;
  const makerFees = makerVolume * makerFeeRate;

  return {
    totalFees: takerFees + makerFees,
  };
}

/**
 * Get Aevo perpetuals volume data from API
 * @param endpoint - API endpoint URL
 * @returns Volume data response
 */
async function getAevoPerpVolumeData(endpoint: string): Promise<IAevoPerpVolumeResponse> {
  return await fetchURL(endpoint);
}

/**
 * Build Aevo API endpoint for perpetuals volume
 * @param endTime - Timestamp in nanoseconds representing end of period
 * @returns Formatted API endpoint URL
 */
export const aevoPerpVolumeEndpoint = (endTime: number): string => {
  return `https://api.aevo.xyz/statistics?instrument_type=PERPETUAL&end_time=${endTime}`;
};

/**
 * Fetch perpetuals fees data for a given timestamp
 * 
 * @param timestamp - Timestamp representing the end of the 24-hour period
 * @returns IAevoPerpFeesResponse containing daily fees, revenue, and volume data
 * 
 * @example
 
 */
export async function fetchAevoPerpFeesData(timestamp: number): Promise<IAevoPerpFeesResponse> {
  // Get the start of next day in UTC and convert to nanoseconds for API
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const timestampInNanoSeconds = dayTimestamp * 1e9;

  // Fetch perpetuals volume data from Aevo API
  const aevoPerpVolumeData = await getAevoPerpVolumeData(
    aevoPerpVolumeEndpoint(timestampInNanoSeconds)
  );

  // Convert volume from string to number
  const dailyVolume = Number(aevoPerpVolumeData.daily_volume);

  // Calculate fee breakdown: taker + maker
  const feeBreakdown = calculatePerpFeesFromVolume(
    dailyVolume,
    PERP_TAKER_FEE_RATE,
    PERP_MAKER_FEE_RATE
  );

  // Format and round values to 2 decimal places
  const dailyVolumeFormatted = dailyVolume.toFixed(2);
  const totalFeesFormatted = Number(feeBreakdown.totalFees.toFixed(2));

  return {
    timestamp,
    dailyFees: totalFeesFormatted,
    dailyRevenue: totalFeesFormatted, // For perpetuals, revenue equals fees collected
    dailyProtocolRevenue: totalFeesFormatted, // Protocol receives all collected fees
    dailyVolume: dailyVolumeFormatted,
    dailyNotionalVolume: dailyVolumeFormatted,
  };
}


export async function fetchAevoPerpFeesDataWithCustomRates(
  timestamp: number,
  takerRate: number,
  makerRate: number
): Promise<IAevoPerpFeesResponse> {
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const timestampInNanoSeconds = dayTimestamp * 1e9;

  const aevoPerpVolumeData = await getAevoPerpVolumeData(
    aevoPerpVolumeEndpoint(timestampInNanoSeconds)
  );

  const dailyVolume = Number(aevoPerpVolumeData.daily_volume);
  const feeBreakdown = calculatePerpFeesFromVolume(dailyVolume, takerRate, makerRate);

  return {
    timestamp,
    dailyFees: Number(feeBreakdown.totalFees.toFixed(2)),
    dailyRevenue: Number(feeBreakdown.totalFees.toFixed(2)),
    dailyProtocolRevenue: Number(feeBreakdown.totalFees.toFixed(2)),
    dailyVolume: dailyVolume.toFixed(2),
    dailyNotionalVolume: dailyVolume.toFixed(2),
  };
}

/**
 * Fetch perpetuals fees for multiple timestamps in batch
 */
export async function fetchAevoPerpFeesBatch(
  timestamps: number[]
): Promise<IAevoPerpFeesResponse[]> {
  const promises = timestamps.map(ts => fetchAevoPerpFeesData(ts));
  return Promise.all(promises);
}

// Adapter configuration for perpetuals
const perpetualsAdapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchAevoPerpFeesData,
      start: '2023-06-01', // Aevo perpetuals launch date
    },
  },
};

export default perpetualsAdapter;