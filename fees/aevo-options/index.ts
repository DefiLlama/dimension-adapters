import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

interface IAevoVolumeResponse {
  daily_volume: string;
  daily_volume_premium: string;
  total_volume: string;
  total_volume_premium: string;
}

interface IAevoFeesResponse {
  timestamp: number;
  dailyFees: number;
  dailyRevenue: number;
  dailyProtocolRevenue: number;
  dailyVolume: string;
  dailyNotionalVolume: string;
  dailyPremiumVolume: string;
}

/**
 * Aevo Fee Structure :
 * - Options Trading Fees: min((taker 0.05%/maker 0.03% * notional), 12.5% * premium)
 * - Perpetuals: Taker 0.08%, Maker 0.05% (no caps)
 * - Options Settlement: 0.015% * ITM notional (capped at 12.5% intrinsic), daily options exempt
 * 
 * Limitations: API lacks per-trade premium/cap data & ITM details.
 * Uses original uncapped calc as approximation (common DeFiLlama practice).
 * True revenue requires additional endpoints or on-chain parsing.
 */

// Fee rates (unchanged)
const OPTIONS_TAKER_FEE_RATE = 0.0005;
const OPTIONS_MAKER_FEE_RATE = 0.0003;
const PERP_TAKER_FEE_RATE = 0.0008;
const PERP_MAKER_FEE_RATE = 0.0005;
const TAKER_VOLUME_SPLIT = 0.5;
const MAKER_VOLUME_SPLIT = 0.5;

export const aevoVolumeEndpoint = (endTime: number, instrumentType: string = "OPTION") => {
  return `https://api.aevo.xyz/statistics?instrument_type=${instrumentType}&end_time=${endTime}`;
};

function calculateFeesFromVolume(
  volume: number,
  takerFeeRate: number,
  makerFeeRate: number
): {
  totalFees: number;
  takerFees: number;
  makerFees: number;
} {
  const takerVolume = volume * TAKER_VOLUME_SPLIT;
  const makerVolume = volume * MAKER_VOLUME_SPLIT;
  const takerFees = takerVolume * takerFeeRate;
  const makerFees = makerVolume * makerFeeRate;
  return {
    totalFees: takerFees + makerFees,
    takerFees,
    makerFees,
  };
}

async function getAevoVolumeData(endpoint: string): Promise<IAevoVolumeResponse> {
  return (await fetchURL(endpoint));
}

/**
 * Fetch options fees (uncapped approximation due to API limits)
 * Note: Excludes settlement fees (requires ITM data not in API)
 */
export async function fetchAevoOptionFeesData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
): Promise<IAevoFeesResponse> {
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const timestampInNanoSeconds = dayTimestamp * 1e9;

  const aevoVolumeData = await getAevoVolumeData(
    aevoVolumeEndpoint(timestampInNanoSeconds, "OPTION")
  );

  const dailyVolume = Number(aevoVolumeData.daily_volume); // Notional
  const dailyNotionalVolume = dailyVolume.toFixed(2);
  const dailyPremiumVolume = Number(aevoVolumeData.daily_volume_premium).toFixed(2);

  // Uncapped trading fees (approx; caps reduce real fees)
  const feeBreakdown = calculateFeesFromVolume(
    dailyVolume,
    OPTIONS_TAKER_FEE_RATE,
    OPTIONS_MAKER_FEE_RATE
  );

  // Placeholder for settlement (0 if daily options dominant)
  const estimatedSettlementFees = 0; // TODO: Fetch ITM data if available

  const totalFees = feeBreakdown.totalFees + estimatedSettlementFees;

  return {
    timestamp: timestamp,
    dailyFees: Number(totalFees.toFixed(2)),
    dailyRevenue: Number(totalFees.toFixed(2)),
    dailyProtocolRevenue: Number(totalFees.toFixed(2)),
    dailyVolume: dailyNotionalVolume,
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

/**
 * Fetch perpetuals fees (no caps)
 */
export async function fetchAevoPerpFeesData(
  /** Timestamp representing the end of the 24 hour period */
  timestamp: number
): Promise<IAevoFeesResponse> {
  const dayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const timestampInNanoSeconds = dayTimestamp * 1e9;

  const aevoVolumeData = await getAevoVolumeData(
    aevoVolumeEndpoint(timestampInNanoSeconds, "PERPETUAL")
  );

  const dailyVolume = Number(aevoVolumeData.daily_volume);

  const feeBreakdown = calculateFeesFromVolume(
    dailyVolume,
    PERP_TAKER_FEE_RATE,
    PERP_MAKER_FEE_RATE
  );

  return {
    timestamp: timestamp,
    dailyFees: Number(feeBreakdown.totalFees.toFixed(2)),
    dailyRevenue: Number(feeBreakdown.totalFees.toFixed(2)),
    dailyProtocolRevenue: Number(feeBreakdown.totalFees.toFixed(2)),
    dailyVolume: dailyVolume.toFixed(2),
    dailyNotionalVolume: "",
    dailyPremiumVolume: "",
  };
}

export async function fetchAevoAllFeesData(
  timestamp: number
): Promise<{
  options: IAevoFeesResponse;
  perpetuals: IAevoFeesResponse;
}> {
  const [optionsFees, perpFees] = await Promise.all([
    fetchAevoOptionFeesData(timestamp),
    fetchAevoPerpFeesData(timestamp),
  ]);

  return {
    options: optionsFees,
    perpetuals: perpFees,
  };
}

const optionsAdapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchAevoOptionFeesData,
      start: '2023-04-07',
    },
  },
};

const perpetualsAdapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchAevoPerpFeesData,
      start: '2023-06-01',
    },
  },
};

export default optionsAdapter;
export { perpetualsAdapter };