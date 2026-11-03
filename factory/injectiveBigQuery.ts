import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

const BASE_URL = "https://bigquery-api-636134865280.europe-west1.run.app";
const INJECTIVE_CACHE_API = "https://api.ui.injective.network/api/v1/cache";

interface VolumeConfig {
  endpoint: string;
  fallbackEndpoint?: string;
  start: string;
  doublecounted?: boolean;
  methodology?: Record<string, string>;
}

interface FeesConfig {
  endpoint: string;
  feesLabel: string;
  start: string;
  doublecounted?: boolean;
  methodology?: Record<string, string>;
  breakdownMethodology?: Record<string, Record<string, string>>;
}

async function fetchFallbackVolume(endpoint: string): Promise<number> {
  const res: any = await httpGet(`${INJECTIVE_CACHE_API}/${endpoint}/tc/summary`);
  if (!Array.isArray(res) || res.length === 0) return 0;
  return res.reduce((acc: number, item: any) => {
    const vol = parseFloat(item?.volume);
    return acc + (!isNaN(vol) && vol > 0 ? vol : 0);
  }, 0);
}

/** Whether a requested UTC day is no more than 48 hours old and not in the future. */
function isRecentDate(dateString: string): boolean {
  const targetTime = new Date(dateString).getTime();
  const age = Date.now() - targetTime;
  // Allow cache fallback only for requests within the last 48 hours
  return age >= 0 && age <= 48 * 60 * 60 * 1000;
}

/** Build a daily volume adapter that rejects nonmatching rows before considering live fallback. */
function createVolumeAdapter(config: VolumeConfig): SimpleAdapter {
  /** Accept matching daily data; retain recent live fallback only when no single conflicting row exists. */
  const fetch = async (options: FetchOptions) => {
    let hasMismatchedDailyRow = false;
    try {
      const res: any = await httpGet(`${BASE_URL}/${config.endpoint}?start_date=${options.dateString}`);
      if (res && Array.isArray(res.days) && res.days.length === 1 && res.days[0]?.date === options.dateString) {
        return { dailyVolume: res.total_volume_usd };
      }
      hasMismatchedDailyRow = Boolean(res && Array.isArray(res.days) && res.days.length === 1);
    } catch {
      // BigQuery offline or request failed
    }

    // A live snapshot cannot replace a daily row with a conflicting or missing date.
    if (config.fallbackEndpoint && !hasMismatchedDailyRow && isRecentDate(options.dateString)) {
      const liveVolume = await fetchFallbackVolume(config.fallbackEndpoint);
      if (liveVolume > 0) {
        return { dailyVolume: liveVolume };
      }
    }

    throw new Error(`No data found for the given date: ${options.dateString}`);
  };

  return {
    fetch,
    start: config.start,
    chains: [CHAIN.INJECTIVE],
    ...(config.doublecounted ? { doublecounted: true } : {}),
    ...(config.methodology ? { methodology: config.methodology } : {}),
  };
}

/** Build a fees adapter that requires one row matching the requested day. */
function createFeesAdapter(config: FeesConfig): SimpleAdapter {
  /** Validate the daily row before attributing fees and revenue to the requested date. */
  const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const res: any = await httpGet(`${BASE_URL}/${config.endpoint}?start_date=${options.dateString}`);
    if (!res || !Array.isArray(res.days) || res.days.length !== 1 || res.days[0]?.date !== options.dateString) {
      throw new Error("No data found for the given date: " + options.dateString);
    }
    dailyFees.addUSDValue(res.exchange_fees_usd, config.feesLabel);

    return {
      dailyFees,
      dailyRevenue: dailyFees,
      dailyHoldersRevenue: dailyFees,
    };
  };

  return {
    fetch,
    start: config.start,
    chains: [CHAIN.INJECTIVE],
    ...(config.doublecounted ? { doublecounted: true } : {}),
    ...(config.methodology ? { methodology: config.methodology } : {}),
    ...(config.breakdownMethodology ? { breakdownMethodology: config.breakdownMethodology } : {}),
  };
}

const volumeConfigs: Record<string, VolumeConfig> = {
  "injective-spot": {
    endpoint: "injective_spot_volume",
    fallbackEndpoint: "spot",
    start: "2021-07-17",
  },
  "injective-derivatives": {
    endpoint: "injective_derivative_volume",
    fallbackEndpoint: "derivatives",
    start: "2021-07-17",
  },
  "helix-helix": {
    endpoint: "helix_spot_volume",
    start: "2022-09-06",
    doublecounted: true,
  },
  "helix-helix-perp": {
    endpoint: "helix_derivative_volume",
    start: "2022-09-06",
    doublecounted: true,
  },
  "truecurrent": {
    endpoint: "truecurrent_derivative_volume",
    start: "2026-05-15",
    doublecounted: true,
    methodology: {
      Volume: "Notional volume of all trades on Truecurrent interface (built on Injective DEX)",
    },
  },
};

const feesConfigs: Record<string, FeesConfig> = {
  "helix-helix": {
    endpoint: "helix_spot_fees",
    feesLabel: "Spot Trading Fees",
    start: "2022-09-06",
    doublecounted: true,
    methodology: {
      Fees: "Trading fees on Helix spot markets, sourced from BigQuery (helix_webapp.helix_spot_volume_and_fee).",
      Revenue: "100% of Helix spot exchange fees enter the Injective auction and are burned for INJ.",
      HoldersRevenue: "100% of Helix spot exchange fees burned for INJ via the Injective auction (benefits INJ holders).",
    },
    breakdownMethodology: {
      Fees: {
        "Spot Trading Fees": "Sum of |fee_notional_usd| from helix_spot_volume_and_fee, execution_side = maker_taker.",
      },
      Revenue: {
        "Spot Trading Fees": "All Helix spot exchange fees flow to the Injective burn auction.",
      },
      HoldersRevenue: {
        "Spot Trading Fees": "All Helix spot exchange fees flow to the Injective burn auction (INJ burn benefits holders).",
      },
    },
  },
  "helix-helix-perp": {
    endpoint: "helix_derivative_fees",
    feesLabel: "Derivative Trading Fees",
    start: "2022-09-06",
    doublecounted: true,
    methodology: {
      Fees: "Trading fees on Helix derivative markets, sourced from BigQuery (helix_webapp.helix_derivative_volume_and_fee).",
      Revenue: "100% of Helix derivative exchange fees enter the Injective auction and are burned for INJ.",
      HoldersRevenue: "100% of Helix derivative exchange fees burned for INJ via the Injective auction (benefits INJ holders).",
    },
    breakdownMethodology: {
      Fees: {
        "Derivative Trading Fees": "Sum of |fee_notional_usd| from helix_derivative_volume_and_fee, execution_side = maker_taker.",
      },
      Revenue: {
        "Derivative Trading Fees": "All Helix derivative exchange fees flow to the Injective burn auction.",
      },
      HoldersRevenue: {
        "Derivative Trading Fees": "All Helix derivative exchange fees flow to the Injective burn auction (INJ burn benefits holders).",
      },
    },
  },
  "truecurrent": {
    endpoint: "truecurrent_fees",
    feesLabel: "Derivative Trading Fees",
    start: "2026-05-15",
    doublecounted: true,
    methodology: {
      Fees: "Trading fees on Truecurrent derivative markets on Injective.",
      Revenue: "100% of Truecurrent exchange fees enter the Injective auction and are burned for INJ.",
      HoldersRevenue: "100% of Truecurrent exchange fees burned for INJ via the Injective auction (benefits INJ holders).",
    },
    breakdownMethodology: {
      Fees: {
        "Derivative Trading Fees": "Exchange fees on Truecurrent derivative markets.",
      },
      Revenue: {
        "Derivative Trading Fees": "All Truecurrent exchange fees flow to the Injective burn auction.",
      },
      HoldersRevenue: {
        "Derivative Trading Fees": "All Truecurrent exchange fees flow to the Injective burn auction (INJ burn benefits holders).",
      },
    },
  },
};

const volumeProtocols: Record<string, SimpleAdapter> = {};
for (const [name, config] of Object.entries(volumeConfigs)) {
  volumeProtocols[name] = createVolumeAdapter(config);
}

const feesProtocols: Record<string, SimpleAdapter> = {};
for (const [name, config] of Object.entries(feesConfigs)) {
  feesProtocols[name] = createFeesAdapter(config);
}

const { protocolList, getAdapter } = createFactoryExports(volumeProtocols);
export { protocolList, getAdapter };

export const fees = createFactoryExports(feesProtocols);
