import type { Balances } from "@defillama/sdk";
import type { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchURLAutoHandleRateLimit, httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

// Native Core CLOB fees — same listing slug as `dexs/native-core`.
// Public stats: GET /api/v3/stats/window (https://api-ui.native.org)
//   from/to: unix seconds on exact hour boundaries, half-open [from, to)
//   35-day rolling coverage; a window past coverage_end is 404, never a zero.
// Native Pool distributions: https://app.native.org/native-pool/distributions
// Maker and taker each pay independently; Pool payouts are supply-side revenue.
const STATS_WINDOW_URL = "https://api-ui.native.org/api/v3/stats/window";
const TICKERS_URL = "https://api-ui.native.org/api/v3/cg/tickers";
const EARN_URL = "https://api-ui.native.org/api/v3/earn";
const REGISTRY_URL = "https://api-ui.native.org/api/v3/core/registry";
const HOUR = 3600;
const USD_QUOTES = new Set(["USDC", "USDT"]);

const MAKER_FEES = "Maker Fees";
const TAKER_FEES = "Taker Fees";
const MAKER_TO_TREASURY = "Maker Fees To Treasury";
const TAKER_TO_TREASURY = "Taker Fees To Treasury";
const POOL_YIELD_TO_LPS = "Native Pool Yield To LPs";

type FeeRow = {
  asset_id: number;
  symbol: string;
  decimals: number;
  maker_atoms: string;
  taker_atoms: string;
  maker: string;
  taker: string;
};

type StatsWindow = {
  from: number;
  to: number;
  stale?: boolean;
  unpriced_trades?: number;
  fees?: FeeRow[] | null;
};

type CgTicker = {
  base_currency: string;
  target_currency: string;
  last_price: string;
};

type VenuePrice = { cgId: string; price: number };

type EarnEnvelope<T> = {
  code: number;
  data?: T;
  message?: string;
};

type PoolAsset = {
  asset_id: number;
  symbol: string;
  balance_decimals: number;
};

type PoolDistribution = {
  id: number;
  asset_id: number;
  distribution_amount: string;
  completed_at_unix_ms: number;
};

type DistributionPage = {
  items: PoolDistribution[] | null;
  next_before_id: number | null;
};

type RegistryUnderlying = {
  assetId: number;
  symbol: string;
  nativeSymbol: string;
  address: string;
  decimals: number;
  enabled: boolean;
};

type RegistryChain = {
  chainKey: string;
  underlyings: RegistryUnderlying[];
};

type RegistryResponse = {
  data?: { chains?: RegistryChain[] };
};

type CoreAssetToken = {
  token: string;
  decimals: number;
};

type CoreAssetTokens = {
  byAssetId: Map<number, CoreAssetToken>;
};

function hourWindow(endTimestamp: number): { from: number; to: number } {
  // FetchOptions.startTimestamp is (end - window - 1s). Flooring that would
  // request the previous hour; Native rejects any from/to not on an hour mark.
  const to = Math.ceil(endTimestamp / HOUR) * HOUR;
  return { from: to - HOUR, to };
}

function parseAmount(raw: string, symbol: string, side: string): number {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Native Core ${side} fee for ${symbol} is invalid: ${raw}`);
  }
  return amount;
}

function parseAtomAmount(raw: string, decimals: number, symbol: string): bigint {
  let atoms: bigint;
  try {
    atoms = BigInt(raw);
  } catch {
    throw new Error(
      `Native Pool distribution for ${symbol} has invalid atom amount: ${raw}`,
    );
  }
  if (atoms < 0n || !Number.isInteger(decimals) || decimals < 0) {
    throw new Error(
      `Native Pool distribution for ${symbol} has invalid amount or decimals`,
    );
  }
  return atoms;
}

function rescaleAtoms(
  raw: string,
  fromDecimals: number,
  toDecimals: number,
  symbol: string,
): bigint {
  const atoms = parseAtomAmount(raw, fromDecimals, symbol);
  const decimalDifference = toDecimals - fromDecimals;
  if (decimalDifference >= 0) {
    return atoms * 10n ** BigInt(decimalDifference);
  }

  const scale = 10n ** BigInt(-decimalDifference);
  if (atoms % scale !== 0n) {
    throw new Error(
      `Native Pool distribution for ${symbol} cannot be represented with ${toDecimals} decimals`,
    );
  }
  return atoms / scale;
}

let poolAssets: Map<number, PoolAsset> | undefined;
let coreAssetTokens: CoreAssetTokens | undefined;
let venuePrices: Map<string, VenuePrice> | undefined;
let distributionCache:
  | {
      items: PoolDistribution[];
      oldestMs: number;
      nextBeforeId?: number;
      exhausted: boolean;
    }
  | undefined;
let distributionMutex: Promise<void> = Promise.resolve();

async function getVenuePrices(): Promise<Map<string, VenuePrice>> {
  if (venuePrices) return venuePrices;

  const tickers: CgTicker[] = await fetchURLAutoHandleRateLimit(TICKERS_URL);
  const prices = new Map<string, VenuePrice>([
    ["USDC", { cgId: "usd-coin", price: 1 }],
    ["USDT", { cgId: "tether", price: 1 }],
  ]);

  for (const ticker of tickers ?? []) {
    if (!USD_QUOTES.has(ticker.target_currency)) continue;
    const price = Number(ticker.last_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const existing = prices.get(ticker.base_currency);
    if (existing?.cgId === "usd-coin") continue;
    prices.set(ticker.base_currency, {
      cgId: ticker.target_currency === "USDC" ? "usd-coin" : "tether",
      price,
    });
  }

  venuePrices = prices;
  return prices;
}

async function postEarn<T>(body: Record<string, unknown>, retries = 5): Promise<T> {
  let lastMessage = "no data";
  for (let attempt = 0; attempt < retries; attempt++) {
    const response: EarnEnvelope<T> = await httpPost(EARN_URL, body, {
      headers: { "content-type": "application/json" },
    });
    if (response.code === 0 && response.data !== undefined) {
      return response.data;
    }
    lastMessage = response.message ?? "no data";
    const rateLimited = /rate/i.test(lastMessage);
    if (!rateLimited || attempt === retries - 1) {
      break;
    }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(
    `Native Pool earn ${JSON.stringify(body)} failed: ${lastMessage}`,
  );
}

async function getPoolAssets(): Promise<Map<number, PoolAsset>> {
  if (poolAssets) return poolAssets;

  const config = await postEarn<{ assets: PoolAsset[] | null }>({ type: "config" });
  poolAssets = new Map((config.assets ?? []).map((asset) => [asset.asset_id, asset]));
  return poolAssets;
}

async function getCoreAssetTokens(): Promise<CoreAssetTokens> {
  if (coreAssetTokens) return coreAssetTokens;

  const registry: RegistryResponse = await fetchURLAutoHandleRateLimit(REGISTRY_URL);
  const byAssetId = new Map<number, CoreAssetToken>();

  for (const chain of registry.data?.chains ?? []) {
    for (const underlying of chain.underlyings ?? []) {
      if (!underlying.enabled || !underlying.address) continue;
      const asset = {
        token: `${chain.chainKey}:${underlying.address}`,
        decimals: underlying.decimals,
      };
      // An asset may be bridged to several chains. Use the enabled
      // representation with the most decimals so Core's balance atoms can be
      // represented exactly; the same choice serves fees and Pool payouts.
      const existing = byAssetId.get(underlying.assetId);
      if (!existing || asset.decimals > existing.decimals) {
        byAssetId.set(underlying.assetId, asset);
      }
    }
  }

  coreAssetTokens = { byAssetId };
  return coreAssetTokens;
}

async function getPoolDistributions(
  fromMilliseconds: number,
  toMilliseconds: number,
): Promise<PoolDistribution[]> {
  const previous = distributionMutex;
  let release!: () => void;
  distributionMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  try {
    if (!distributionCache) {
      distributionCache = {
        items: [],
        oldestMs: Number.POSITIVE_INFINITY,
        exhausted: false,
      };
    }

    while (
      !distributionCache.exhausted &&
      distributionCache.oldestMs > fromMilliseconds
    ) {
      const page = await postEarn<DistributionPage>({
        type: "distributions",
        limit: 200,
        ...(distributionCache.nextBeforeId === undefined
          ? {}
          : { before_id: distributionCache.nextBeforeId }),
      });

      for (const distribution of page.items ?? []) {
        if (!Number.isFinite(distribution.completed_at_unix_ms)) {
          throw new Error(
            `Native Pool distribution ${distribution.id} has an invalid completion timestamp`,
          );
        }
        distributionCache.items.push(distribution);
        distributionCache.oldestMs = Math.min(
          distributionCache.oldestMs,
          distribution.completed_at_unix_ms,
        );
      }

      distributionCache.nextBeforeId = page.next_before_id ?? undefined;
      if (
        distributionCache.nextBeforeId === undefined ||
        !(page.items ?? []).length
      ) {
        distributionCache.exhausted = true;
      }
    }

    return distributionCache.items.filter(
      (distribution) =>
        distribution.completed_at_unix_ms >= fromMilliseconds &&
        distribution.completed_at_unix_ms < toMilliseconds,
    );
  } finally {
    release();
  }
}

async function addFee(
  balances: Balances,
  fee: FeeRow,
  rawAmount: string,
  rawAtoms: string,
  label: string,
): Promise<void> {
  const amount = parseAmount(rawAmount, fee.symbol, "fee");
  if (amount === 0) return;

  const asset = (await getCoreAssetTokens()).byAssetId.get(fee.asset_id);
  if (asset) {
    balances.addTokenVannila(
      asset.token,
      rescaleAtoms(rawAtoms, fee.decimals, asset.decimals, fee.symbol),
      label,
    );
    return;
  }

  // CLOB-only synthetic assets (for example MUon) have no canonical token in
  // the registry, so use their direct USD-quoted CLOB market as a fallback.
  const venue = (await getVenuePrices()).get(fee.symbol);
  if (!venue) {
    throw new Error(
      `Native Core fee asset ${fee.symbol} has no Core registry token or USDC/USDT CLOB price`,
    );
  }
  balances.addCGToken(venue.cgId, amount * venue.price, label);
}

async function addPoolDistribution(
  balances: Balances,
  asset: PoolAsset,
  distribution: PoolDistribution,
): Promise<void> {
  const registryAsset = (await getCoreAssetTokens()).byAssetId.get(asset.asset_id);
  if (!registryAsset) {
    throw new Error(
      `Native Pool distribution ${distribution.id} has no Core registry token for ${asset.symbol}`,
    );
  }
  // Pool balances and the registry's EVM token may use different decimals.
  // Rescaling atoms changes only units, while retaining the same asset token.
  balances.addTokenVannila(
    registryAsset.token,
    rescaleAtoms(
      distribution.distribution_amount,
      asset.balance_decimals,
      registryAsset.decimals,
      asset.symbol,
    ),
    POOL_YIELD_TO_LPS,
  );
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { from, to } = hourWindow(options.endTimestamp);
  const snap: StatsWindow = await fetchURLAutoHandleRateLimit(
    `${STATS_WINDOW_URL}?from=${from}&to=${to}`,
  );

  if (snap.unpriced_trades) {
    options.api.log(
      `Native Core stats window [${from}, ${to}) has ${snap.unpriced_trades} unpriced trades`,
    );
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const row of snap.fees ?? []) {
    await addFee(dailyFees, row, row.maker, row.maker_atoms, MAKER_FEES);
    await addFee(dailyFees, row, row.taker, row.taker_atoms, TAKER_FEES);
    await addFee(dailyRevenue, row, row.maker, row.maker_atoms, MAKER_TO_TREASURY);
    await addFee(dailyRevenue, row, row.taker, row.taker_atoms, TAKER_TO_TREASURY);
  }

  const assets = await getPoolAssets();
  const distributions = await getPoolDistributions(from * 1000, to * 1000);
  for (const distribution of distributions) {
    const asset = assets.get(distribution.asset_id);
    if (!asset) {
      throw new Error(
        `Native Pool distribution ${distribution.id} has unknown asset ${distribution.asset_id}`,
      );
    }
    await addPoolDistribution(dailySupplySideRevenue, asset, distribution);
  }
  dailyRevenue.subtract(dailySupplySideRevenue, POOL_YIELD_TO_LPS);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Maker and taker trading fees on Native Core CLOB fills. Each side pays independently, so both legs are counted. Taken from GET /api/v3/stats/window over the hour. Settlement assets are recorded under their Native Core registry token; CLOB-only synthetic assets without a canonical token are valued from their USDC/USDT market.",
  UserFees: "Same as fees — traders pay both the maker and taker legs.",
  Revenue:
    "Maker and taker fees Native retains after subtracting Native Pool yield distributed to LPs. Revenue can be negative in a distribution hour because Pool payouts include extra rewards as well as fee-funded yield.",
  ProtocolRevenue:
    "Maker and taker fees Native retains after subtracting Native Pool yield distributed to LPs. Revenue can be negative in a distribution hour because Pool payouts include extra rewards as well as fee-funded yield.",
  SupplySideRevenue:
    "Native Pool yield paid to LPs, from POST /api/v3/earn distributions. This includes fee-funded yield and extra rewards.",
};

const breakdownMethodology = {
  Fees: {
    [MAKER_FEES]: "Trading fees paid by the maker leg of each fill.",
    [TAKER_FEES]: "Trading fees paid by the taker leg of each fill.",
  },
  UserFees: {
    [MAKER_FEES]: "Trading fees paid by the maker leg of each fill.",
    [TAKER_FEES]: "Trading fees paid by the taker leg of each fill.",
  },
  Revenue: {
    [MAKER_TO_TREASURY]: "Maker fees kept by Native.",
    [TAKER_TO_TREASURY]: "Taker fees kept by Native.",
    [POOL_YIELD_TO_LPS]: "Native Pool yield paid to LPs, deducted from retained fees.",
  },
  ProtocolRevenue: {
    [MAKER_TO_TREASURY]: "Maker fees kept by Native.",
    [TAKER_TO_TREASURY]: "Taker fees kept by Native.",
    [POOL_YIELD_TO_LPS]: "Native Pool yield paid to LPs, deducted from retained fees.",
  },
  SupplySideRevenue: {
    [POOL_YIELD_TO_LPS]:
      "Yield Native Pool distributes to LPs after each distribution, including fee-funded yield and extra rewards.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.NATIVE_CORE],
  // Public /stats coverage is a 35-day rolling window; Native Core itself launched 2026-05-19.
  start: "2026-07-30",
  // Pool distributions are sparse and can include extra rewards, so a payout may exceed CLOB fees in an hour.
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
