import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

const BASE_URL = "https://bigquery-api-636134865280.europe-west1.run.app";
const INJECTIVE_CACHE_API = "https://api.ui.injective.network/api/v1/cache";
const INJECTIVE_DERIVATIVE_API = "https://sentry.exchange.grpc-web.injective.network/api/exchange/derivative";
// default feeRecipient in the helixapp.com bundle; matches BigQuery helix_derivative_volume exactly on 2026-10-25
const HELIX_FEE_RECIPIENT = "inj1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3t5qxqh";
const USD_QUOTE_DECIMALS = 6;
const MARKETS_PER_REQUEST = 50;
const TRADES_PAGE_SIZE = 100;

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
  /** Accept matching daily data; retain recent live fallback only when BigQuery returned no rows. */
  const fetch = async (options: FetchOptions) => {
    let hasMismatchedDailyRow = false;
    try {
      const res: any = await httpGet(`${BASE_URL}/${config.endpoint}?start_date=${options.dateString}`);
      if (res && Array.isArray(res.days) && res.days.length === 1 && res.days[0]?.date === options.dateString) {
        return { dailyVolume: res.total_volume_usd };
      }
      hasMismatchedDailyRow = Boolean(res && Array.isArray(res.days) && res.days.length > 0);
    } catch {
      // BigQuery offline or request failed
    }

    // Live snapshot only covers BigQuery lag (no rows); never replace rows returned for another date.
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

async function fetchHelixDerivativeTrades(options: FetchOptions) {
  const { markets }: any = await httpGet(`${INJECTIVE_DERIVATIVE_API}/v1/markets?marketStatuses=active&marketStatuses=paused&marketStatuses=expired&marketStatuses=demolished`);
  const startTime = options.startTimestamp * 1000;
  const endTime = options.endTimestamp * 1000 - 1;
  let volume = 0;
  let fees = 0;
  for (let i = 0; i < markets.length; i += MARKETS_PER_REQUEST) {
    const marketIds = markets.slice(i, i + MARKETS_PER_REQUEST).map((market: any) => `marketIds=${market.marketId}`).join("&");
    for (let skip = 0; ; skip += TRADES_PAGE_SIZE) {
      const { trades = [] }: any = await httpGet(`${INJECTIVE_DERIVATIVE_API}/v2/trades?${marketIds}&feeRecipient=${HELIX_FEE_RECIPIENT}&startTime=${startTime}&endTime=${endTime}&limit=${TRADES_PAGE_SIZE}&skip=${skip}`);
      for (const trade of trades) {
        volume += Number(trade.positionDelta.executionPrice) * Number(trade.positionDelta.executionQuantity) / 10 ** USD_QUOTE_DECIMALS;
        fees += Math.abs(Number(trade.fee)) / 10 ** USD_QUOTE_DECIMALS;
      }
      if (trades.length < TRADES_PAGE_SIZE) break;
    }
  }
  return { volume, fees };
}

const helixPerpVolume: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: async (options: FetchOptions) => {
    const { volume } = await fetchHelixDerivativeTrades(options);
    return { dailyVolume: volume };
  },
  start: "2022-09-06",
  chains: [CHAIN.INJECTIVE],
  doublecounted: true,
};

const helixPerpFees: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: async (options: FetchOptions) => {
    const { fees } = await fetchHelixDerivativeTrades(options);
    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(fees, "Derivative Trading Fees");
    return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
  },
  start: "2022-09-06",
  chains: [CHAIN.INJECTIVE],
  doublecounted: true,
  methodology: {
    Fees: "Trading fees on Injective derivative orders placed through Helix (orders carrying Helix's fee recipient), from the Injective indexer.",
    Revenue: "100% of Helix derivative exchange fees enter the Injective auction and are burned for INJ.",
    HoldersRevenue: "100% of Helix derivative exchange fees burned for INJ via the Injective auction (benefits INJ holders).",
  },
  breakdownMethodology: {
    Fees: {
      "Derivative Trading Fees": "Sum of |fee| over maker and taker fills of Helix derivative orders.",
    },
    Revenue: {
      "Derivative Trading Fees": "All Helix derivative exchange fees flow to the Injective burn auction.",
    },
    HoldersRevenue: {
      "Derivative Trading Fees": "All Helix derivative exchange fees flow to the Injective burn auction (INJ burn benefits holders).",
    },
  },
};

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

const volumeProtocols: Record<string, SimpleAdapter> = { "helix-helix-perp": helixPerpVolume };
for (const [name, config] of Object.entries(volumeConfigs)) {
  volumeProtocols[name] = createVolumeAdapter(config);
}

const feesProtocols: Record<string, SimpleAdapter> = { "helix-helix-perp": helixPerpFees };
for (const [name, config] of Object.entries(feesConfigs)) {
  feesProtocols[name] = createFeesAdapter(config);
}

const { protocolList, getAdapter } = createFactoryExports(volumeProtocols);
export { protocolList, getAdapter };

export const fees = createFactoryExports(feesProtocols);
