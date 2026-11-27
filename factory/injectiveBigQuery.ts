import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

const BASE_URL = "https://bigquery-api-636134865280.europe-west1.run.app";
const INJECTIVE_CACHE_API = "https://api.ui.injective.network/api/v1/cache";
const INJECTIVE_DERIVATIVE_API = "https://sentry.exchange.grpc-web.injective.network/api/exchange/derivative";
const INJECTIVE_SPOT_API = "https://sentry.exchange.grpc-web.injective.network/api/exchange/spot";
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

const MARKET_STATUSES = "marketStatuses=active&marketStatuses=paused&marketStatuses=expired&marketStatuses=demolished";

/**
 * Every fill of a Helix order (Helix's fee recipient) in the fetch window, per tradeId. The indexer's skip paging loses
 * and repeats rows on busy markets (INJ/USDC on 2026-10-25: 29 of 6,760 fills lost and 29 repeated), so page backwards
 * on executedAt instead and dedupe by tradeId.
 */
async function fetchHelixTrades(api: string, options: FetchOptions) {
  const { markets }: any = await httpGet(`${api}/v1/markets?${MARKET_STATUSES}`);
  const startTime = options.startTimestamp * 1000;
  const trades = new Map<string, any>();
  const getPage = async (marketIds: string, from: number, to: number, skip = 0): Promise<any[]> => {
    const { trades: page = [] }: any = await httpGet(`${api}/v2/trades?${marketIds}&feeRecipient=${HELIX_FEE_RECIPIENT}&startTime=${from}&endTime=${to}&limit=${TRADES_PAGE_SIZE}&skip=${skip}`);
    for (const trade of page) trades.set(trade.tradeId, trade);
    return page;
  };
  for (let i = 0; i < markets.length; i += MARKETS_PER_REQUEST) {
    const marketIds = markets.slice(i, i + MARKETS_PER_REQUEST).map((market: any) => `marketIds=${market.marketId}`).join("&");
    let endTime = options.endTimestamp * 1000 - 1;
    while (true) {
      const page = await getPage(marketIds, startTime, endTime);
      if (page.length < TRADES_PAGE_SIZE) break;
      const oldest = Math.min(...page.map((trade) => Number(trade.executedAt)));
      if (oldest < endTime) {
        endTime = oldest;
        continue;
      }
      // a full page inside one millisecond: skip-page that millisecond, then move past it
      for (let skip = 0; ; skip += TRADES_PAGE_SIZE) {
        if ((await getPage(marketIds, oldest, oldest, skip)).length < TRADES_PAGE_SIZE) break;
      }
      if (oldest <= startTime) break;
      endTime = oldest - 1;
    }
  }
  return { markets, trades: [...trades.values()] };
}

async function fetchHelixDerivativeTrades(options: FetchOptions) {
  const { trades } = await fetchHelixTrades(INJECTIVE_DERIVATIVE_API, options);
  let volume = 0;
  let fees = 0;
  for (const trade of trades) {
    volume += Number(trade.positionDelta.executionPrice) * Number(trade.positionDelta.executionQuantity) / 10 ** USD_QUOTE_DECIMALS;
    fees += Math.abs(Number(trade.fee)) / 10 ** USD_QUOTE_DECIMALS;
  }
  return { volume, fees };
}

// USD stablecoin quote denoms coins.llama.fi has no injective price for, with their decimals. Fills in any other quote
// (INJ, USDT, wETH, ATOM, ...) are priced from the quote denom.
const HELIX_SPOT_USD_QUOTES: Record<string, number> = {
  "erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a": 6, // USDC
  "ibc/2CBC2EA121AE42563B08028466F37B600F2D7D4282342DE938283CC3FB2BC00E": 6, // USDCnb
  "peggy0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": 6, // USDC (legacy peggy)
  "factory/inj14ejqjyq8um4p3xfqj74yld5waqljf88f9eneuk/inj1q6zlut7gtkzknkk773jecujwsdkgq882akqksk": 6, // USDCet
  "factory/inj1n636d9gzrqggdk66n2f97th0x8yuhfrtx520e7/ausd": 6, // AUSD
};

async function fetchHelixSpot(options: FetchOptions) {
  const { markets, trades } = await fetchHelixTrades(INJECTIVE_SPOT_API, options);
  const quoteDenoms: Record<string, string> = Object.fromEntries(markets.map((market: any) => [market.marketId, market.quoteDenom]));
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  for (const trade of trades) {
    const quoteDenom = quoteDenoms[trade.marketId];
    if (!quoteDenom) throw new Error(`Helix spot: trade ${trade.tradeId} is on unknown market ${trade.marketId}`);
    // price is quote base units per base base unit, quantity and fee are base units
    const notional = Number(trade.price.price) * Number(trade.price.quantity);
    const fee = Math.abs(Number(trade.fee));
    const usdDecimals = HELIX_SPOT_USD_QUOTES[quoteDenom];
    if (usdDecimals !== undefined) {
      dailyVolume.addUSDValue(notional / 10 ** usdDecimals);
      dailyFees.addUSDValue(fee / 10 ** usdDecimals, "Spot Trading Fees");
    } else {
      dailyVolume.add(quoteDenom, notional);
      dailyFees.add(quoteDenom, fee, "Spot Trading Fees");
    }
  }
  return { dailyVolume, dailyFees };
}

const helixSpotVolume: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: async (options: FetchOptions) => ({ dailyVolume: (await fetchHelixSpot(options)).dailyVolume }),
  start: "2022-09-06",
  chains: [CHAIN.INJECTIVE],
  doublecounted: true,
  methodology: {
    Volume: "Notional of every fill of a Helix spot order (orders carrying Helix's fee recipient), maker and taker, from the Injective indexer.",
  },
};

const helixSpotFees: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: async (options: FetchOptions) => {
    const { dailyFees } = await fetchHelixSpot(options);
    return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
  },
  start: "2022-09-06",
  chains: [CHAIN.INJECTIVE],
  doublecounted: true,
  methodology: {
    Fees: "Trading fees on Injective spot orders placed through Helix (orders carrying Helix's fee recipient), from the Injective indexer.",
    Revenue: "100% of Helix spot exchange fees enter the Injective auction and are burned for INJ.",
    HoldersRevenue: "100% of Helix spot exchange fees burned for INJ via the Injective auction (benefits INJ holders).",
  },
  breakdownMethodology: {
    Fees: {
      "Spot Trading Fees": "Sum of |fee| over maker and taker fills of Helix spot orders.",
    },
    Revenue: {
      "Spot Trading Fees": "All Helix spot exchange fees flow to the Injective burn auction.",
    },
    HoldersRevenue: {
      "Spot Trading Fees": "All Helix spot exchange fees flow to the Injective burn auction (INJ burn benefits holders).",
    },
  },
};

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

const volumeProtocols: Record<string, SimpleAdapter> = { "helix-helix": helixSpotVolume, "helix-helix-perp": helixPerpVolume };
for (const [name, config] of Object.entries(volumeConfigs)) {
  volumeProtocols[name] = createVolumeAdapter(config);
}

const feesProtocols: Record<string, SimpleAdapter> = { "helix-helix": helixSpotFees, "helix-helix-perp": helixPerpFees };
for (const [name, config] of Object.entries(feesConfigs)) {
  feesProtocols[name] = createFeesAdapter(config);
}

const { protocolList, getAdapter } = createFactoryExports(volumeProtocols);
export { protocolList, getAdapter };

export const fees = createFactoryExports(feesProtocols);
