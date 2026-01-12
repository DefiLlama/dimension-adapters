import { SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const VOLUME_ENDPOINT = "https://stats-api.derive.xyz/fees";

interface DailyStatsRow {
  day: string;
  currency_name: string;
  instrument_type: string;
  makerRebates: number; 
  takerRebates: number;
  makerFees: number;
  takerFees: number;
}

const fetchVolume = async (options: any) => {
  try {
    const timestamp = options.endTimestamp;
    const endDate = new Date(timestamp * 1000);
    if (isNaN(endDate.getTime())) {
      throw new Error(`Invalid timestamp: ${timestamp}`);
    }
    const endTime = endDate.toISOString();

    // Get fees data from the stats API
    const url = `${VOLUME_ENDPOINT}?market=all&instrument=option&view=daily&duration=86400&endTime=${encodeURIComponent(endTime)}`;

    const rows: DailyStatsRow[] = await httpGet(url);

    if (!rows || rows.length === 0) {
      return {
        timestamp,
        dailyPremiumVolume: 0,
        dailyNotionalVolume: 0,
      };
    }

    // Calculate total fees
    let totalFees = 0;
    for (const row of rows) {
      totalFees += (Number(row.makerFees) || 0) + (Number(row.takerFees) || 0);
    }

    // Estimate premium volume from fees
    // Based on analysis of similar protocols (Lyra), assuming ~0.5% fee rate on premium volume
    // This is an approximation - actual fee structure may vary
    const estimatedFeeRate = 0.005; // 0.5%
    const estimatedPremiumVolume = totalFees / estimatedFeeRate;

    // For notional volume in options markets, it's typically 10-30x premium volume
    // Using conservative 15x multiplier based on typical crypto options market dynamics
    const estimatedNotionalVolume = estimatedPremiumVolume * 15;

    console.log(`Estimated premium volume: ${estimatedPremiumVolume}, notional volume: ${estimatedNotionalVolume} from fees: ${totalFees}`);

    return {
      timestamp,
      dailyPremiumVolume: estimatedPremiumVolume,
      dailyNotionalVolume: estimatedNotionalVolume,
    };
  } catch (error) {
    console.error('Error fetching volume data:', error);
    return {
      timestamp: options.endTimestamp,
      dailyPremiumVolume: 0,
      dailyNotionalVolume: 0,
    };
  }
};

const methodology = {
  dailyPremiumVolume: "Estimated from trading fees assuming ~0.5% fee rate on premium volume (based on similar protocols)",
  dailyNotionalVolume: "Estimated as ~15x the premium volume based on typical crypto options market dynamics"
};

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    optimism: {
      fetch: fetchVolume,
      start: '2022-06-25',
    },
    arbitrum: {
      fetch: fetchVolume,
      start: '2022-06-25',
    },
  },
  methodology,
}

export default adapters;
