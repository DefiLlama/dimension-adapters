import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryEvents } from "../../helpers/sui";
import { PromisePool } from "@supercharge/promise-pool";
import { getConfig } from "../../helpers/cache";

const ALPHAFI_CONFIG_ENDPOINT = "https://api.alphafi.xyz/public/config";
const START_DATE = "2024-07-05";
const EVENT_QUERY_CONCURRENCY = 2;

type Asset = {
  name?: string;
  type?: string;
};

type AlphaFiConfigEntry = {
  strategy_type?: string;
  data?: PoolConfig;
};

type PoolConfig = {
  pool_id?: string;
  investor_id?: string;
  strategy_type?: string;
  parent_protocol?: string;
  pool_name?: string;
  asset?: Asset;
  asset_a?: Asset;
  asset_b?: Asset;
  supply_asset?: Asset;
  user_deposit_asset?: Asset;
  user_withdraw_asset?: Asset;
  fungible_coin?: Asset;
  events?: Record<string, string | null | undefined>;
};

type PoolInfo = PoolConfig & {
  strategy_type?: string;
};

type ConfigEvent = {
  key: string;
  eventType: string;
  pool: PoolInfo;
};

function normalizeCoinType(coinType?: string) {
  if (!coinType) return undefined;
  return coinType.startsWith("0x") ? coinType : `0x${coinType}`;
}

function eventCoinType(e: any) {
  return normalizeCoinType(e?.coin_type?.name ?? e?.coin_type);
}

function poolAsset(pool: PoolInfo) {
  return pool.asset?.type
    ?? pool.supply_asset?.type
    ?? pool.user_deposit_asset?.type
    ?? pool.user_withdraw_asset?.type
    ?? pool.fungible_coin?.type;
}

function addAmount(balances: any, token: string | undefined, amount: any, metric: string) {
  const value = BigInt(amount ?? 0);
  if (!token || value === 0n) return;
  balances.add(normalizeCoinType(token), value, metric);
}

function addSupplyYield(balances: {
  dailyFees: any;
  dailySupplySideRevenue: any;
}, token: string | undefined, amount: any) {
  addAmount(balances.dailyFees, token, amount, METRIC.ASSETS_YIELDS);
  addAmount(balances.dailySupplySideRevenue, token, amount, METRIC.ASSETS_YIELDS);
}

function addYieldAndFee(balances: {
  dailyFees: any;
  dailyRevenue: any;
  dailySupplySideRevenue: any;
}, token: string | undefined, yieldAmount: any, feeAmount: any) {
  addSupplyYield(balances, token, yieldAmount);
  addAmount(balances.dailyFees, token, feeAmount, METRIC.PERFORMANCE_FEES);
  addAmount(balances.dailyRevenue, token, feeAmount, METRIC.PERFORMANCE_FEES);
}

function configuredEvents(
  pools: PoolInfo[],
  predicate: (key: string, eventType: string, pool: PoolInfo) => boolean,
) {
  return pools.flatMap((pool) => Object.entries(pool.events ?? {})
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .filter(([key, eventType]) => predicate(key, eventType, pool))
    .map(([key, eventType]) => ({ key, eventType, pool })));
}

function isXTokenRatioEvent(key: string, eventType: string) {
  return key.includes("xtoken_ratio") || eventType.includes("XtokenRatioChangeEvent");
}

function isYieldEvent(key: string, eventType: string, pool: PoolInfo) {
  if (isXTokenRatioEvent(key, eventType)) return !pool.events?.auto_compounding_event_real;
  return key.includes("autocompound")
    || key.includes("auto_compounding")
    || eventType.includes("AutoCompoundingEvent")
}

function isFeeEvent(key: string) {
  return key.includes("liquidity_change")
    || key.includes("withdraw")
    || key.includes("deposit")
    || key.includes("claim_withdraw");
}

async function queryConfiguredEvents(events: ConfigEvent[], options: FetchOptions) {
  const eventsByType = new Map<string, ConfigEvent[]>();
  for (const event of events) {
    eventsByType.set(event.eventType, [...eventsByType.get(event.eventType) ?? [], event]);
  }

  const { results, errors } = await PromisePool
    .withConcurrency(EVENT_QUERY_CONCURRENCY)
    .for([...eventsByType.keys()])
    .process(async (eventType) => (await queryEvents({ eventType, options })).map((event: any) => ({
      event,
      configEvents: eventsByType.get(eventType) ?? [],
    })));

  if (errors.length > 0) throw errors[0];
  return results.flat();
}

function poolForEvent(event: any, configEvents: ConfigEvent[], byInvestor: Map<string, PoolInfo>, byPool: Map<string, PoolInfo>) {
  if (event.investor_id && byInvestor.has(event.investor_id)) return byInvestor.get(event.investor_id);
  if (event.pool_id && byPool.has(event.pool_id)) return byPool.get(event.pool_id);

  const poolsById = new Map(configEvents.map((configEvent) => [configEvent.pool.pool_id, configEvent.pool]));
  return poolsById.size === 1 ? [...poolsById.values()][0] : undefined;
}

async function getPoolConfig() {
  const config: Record<string, AlphaFiConfigEntry> = (await getConfig('alphafi', ALPHAFI_CONFIG_ENDPOINT));
  const pools = Object.values(config)
    .map((entry) => ({
      strategy_type: entry.strategy_type ?? entry.data?.strategy_type,
      ...entry.data,
    }))
    .filter((pool) => pool.pool_id && pool.events) as PoolInfo[];

  return {
    pools,
    byInvestor: new Map(pools.filter((pool) => pool.investor_id).map((pool) => [pool.investor_id!, pool])),
    byPool: new Map(pools.map((pool) => [pool.pool_id!, pool])),
  };
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { pools, byInvestor, byPool } = await getPoolConfig();

  const yieldEvents = configuredEvents(pools, isYieldEvent);
  for (const { event: e, configEvents } of await queryConfiguredEvents(yieldEvents, options)) {
    const pool = poolForEvent(e, configEvents, byInvestor, byPool);
    if (!pool) continue;
    const balances = { dailyFees, dailyRevenue, dailySupplySideRevenue };

    if (e.new_tokens_invested !== undefined || e.old_tokens_invested !== undefined) {
      const yieldAmount = BigInt(e.new_tokens_invested ?? 0) - BigInt(e.old_tokens_invested ?? 0);
      if (yieldAmount > 0n) {
        addSupplyYield({ dailyFees, dailySupplySideRevenue }, poolAsset(pool), yieldAmount);
      }
    } else if (
      e.compound_amount_a !== undefined ||
      e.compound_amount_b !== undefined ||
      e.fee_collected_a !== undefined ||
      e.fee_collected_b !== undefined
    ) {
      addYieldAndFee(balances, pool.asset_a?.type, e.compound_amount_a, e.fee_collected_a);
      addYieldAndFee(balances, pool.asset_b?.type, e.compound_amount_b, e.fee_collected_b);
    } else if (
      e.compound_amount !== undefined ||
      e.amount !== undefined ||
      e.profit !== undefined ||
      e.fee_collected !== undefined
    ) {
      const token = eventCoinType(e) ?? poolAsset(pool);
      addYieldAndFee(balances, token, e.compound_amount ?? e.amount ?? e.profit, e.fee_collected);
    }
  }

  const feeEvents = configuredEvents(pools, (key) => isFeeEvent(key));
  for (const { event: e, configEvents } of await queryConfiguredEvents(feeEvents, options)) {
    const pool = poolForEvent(e, configEvents, byInvestor, byPool);
    if (!pool) continue;

    if (e.fee_collected_a !== undefined || e.fee_collected_b !== undefined) {
      addAmount(dailyFees, pool.asset_a?.type, e.fee_collected_a, METRIC.DEPOSIT_WITHDRAW_FEES);
      addAmount(dailyFees, pool.asset_b?.type, e.fee_collected_b, METRIC.DEPOSIT_WITHDRAW_FEES);
      addAmount(dailyRevenue, pool.asset_a?.type, e.fee_collected_a, METRIC.DEPOSIT_WITHDRAW_FEES);
      addAmount(dailyRevenue, pool.asset_b?.type, e.fee_collected_b, METRIC.DEPOSIT_WITHDRAW_FEES);
    } else if (e.fee_collected !== undefined) {
      addAmount(dailyFees, poolAsset(pool), e.fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
      addAmount(dailyRevenue, poolAsset(pool), e.fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
    }

    addAmount(dailyFees, poolAsset(pool), e.instant_withdraw_fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
    addAmount(dailyRevenue, poolAsset(pool), e.instant_withdraw_fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Gross AlphaFi strategy yield emitted by autocompound and x-token ratio events, plus deposit/withdraw and instant-withdraw fees emitted by pool events when non-zero.",
  Revenue: "Fees collected by AlphaFi, including performance fees from autocompound/reward events and deposit/withdraw fees from pool events.",
  ProtocolRevenue: "Same as revenue.",
  SupplySideRevenue: "Strategy yield attributed to AlphaFi vault depositors.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Yield generated by AlphaFi strategies and attributed to depositors.",
    [METRIC.PERFORMANCE_FEES]: "Performance fees charged by AlphaFi when vault rewards are autocompounded.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit, withdrawal, and instant-withdraw fees emitted by AlphaFi pool events.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees retained by AlphaFi.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit, withdrawal, and instant-withdraw fees retained by AlphaFi.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Yield generated by AlphaFi strategies and attributed to depositors.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees retained by AlphaFi.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit, withdrawal, and instant-withdraw fees retained by AlphaFi.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: START_DATE,
    },
  },
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
