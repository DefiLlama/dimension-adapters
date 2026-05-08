import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryEvents } from "../../helpers/sui";
import fetchURL from "../../utils/fetchURL";
import { PromisePool } from "@supercharge/promise-pool";

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
  events?: {
    autocompound_event_type?: string | null;
    liquidity_change_event_type?: string | null;
    withdraw_v2_event_type?: string | null;
  };
};

type PoolInfo = PoolConfig & {
  strategy_type?: string;
};

function normalizeCoinType(coinType?: string) {
  if (!coinType) return undefined;
  return coinType.startsWith("0x") ? coinType : `0x${coinType}`;
}

function eventCoinType(e: any) {
  return normalizeCoinType(e?.coin_type?.name ?? e?.coin_type);
}

function addAmount(balances: any, token: string | undefined, amount: any, metric: string) {
  const value = BigInt(amount ?? 0);
  if (!token || value === 0n) return;
  balances.add(normalizeCoinType(token), value, metric);
}

function addYieldAndFee(balances: {
  dailyFees: any;
  dailyRevenue: any;
  dailySupplySideRevenue: any;
}, token: string | undefined, yieldAmount: any, feeAmount: any) {
  addAmount(balances.dailyFees, token, yieldAmount, METRIC.ASSETS_YIELDS);
  addAmount(balances.dailySupplySideRevenue, token, yieldAmount, METRIC.ASSETS_YIELDS);
  addAmount(balances.dailyFees, token, feeAmount, METRIC.PERFORMANCE_FEES);
  addAmount(balances.dailyRevenue, token, feeAmount, METRIC.PERFORMANCE_FEES);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean))] as string[];
}

async function queryEventTypes(eventTypes: string[], options: FetchOptions) {
  const { results, errors } = await PromisePool
    .withConcurrency(EVENT_QUERY_CONCURRENCY)
    .for(eventTypes)
    .process((eventType) => queryEvents({ eventType, options }));

  if (errors.length > 0) throw errors[0];
  return results.flat();
}

async function getPoolConfig() {
  const config = (await fetchURL(ALPHAFI_CONFIG_ENDPOINT)) as Record<string, AlphaFiConfigEntry>;
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

  const autocompoundEventTypes = unique(pools.map((pool) => pool.events?.autocompound_event_type));
  for (const e of await queryEventTypes(autocompoundEventTypes, options)) {
    const pool = byInvestor.get(e.investor_id);
    if (!pool) continue;
    const balances = { dailyFees, dailyRevenue, dailySupplySideRevenue };

    if (
      e.compound_amount_a !== undefined ||
      e.compound_amount_b !== undefined ||
      e.fee_collected_a !== undefined ||
      e.fee_collected_b !== undefined
    ) {
      addYieldAndFee(balances, pool.asset_a?.type, e.compound_amount_a, e.fee_collected_a);
      addYieldAndFee(balances, pool.asset_b?.type, e.compound_amount_b, e.fee_collected_b);
    } else if (e.compound_amount !== undefined || e.amount !== undefined || e.fee_collected !== undefined) {
      const token = eventCoinType(e) ?? pool.asset?.type;
      addYieldAndFee(balances, token, e.compound_amount ?? e.amount, e.fee_collected);
    }
  }

  const liquidityChangeEventTypes = unique(pools.map((pool) => pool.events?.liquidity_change_event_type));
  for (const e of await queryEventTypes(liquidityChangeEventTypes, options)) {
    const pool = byPool.get(e.pool_id);
    if (!pool) continue;

    if (e.fee_collected_a !== undefined || e.fee_collected_b !== undefined) {
      addAmount(dailyFees, pool.asset_a?.type, e.fee_collected_a, METRIC.DEPOSIT_WITHDRAW_FEES);
      addAmount(dailyFees, pool.asset_b?.type, e.fee_collected_b, METRIC.DEPOSIT_WITHDRAW_FEES);
      addAmount(dailyRevenue, pool.asset_a?.type, e.fee_collected_a, METRIC.DEPOSIT_WITHDRAW_FEES);
      addAmount(dailyRevenue, pool.asset_b?.type, e.fee_collected_b, METRIC.DEPOSIT_WITHDRAW_FEES);
    } else if (e.fee_collected !== undefined) {
      addAmount(dailyFees, pool.asset?.type, e.fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
      addAmount(dailyRevenue, pool.asset?.type, e.fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
    }
  }

  const withdrawEventTypes = unique(pools.map((pool) => pool.events?.withdraw_v2_event_type));
  for (const e of await queryEventTypes(withdrawEventTypes, options)) {
    const pool = byPool.get(e.pool_id);
    if (!pool) continue;

    addAmount(dailyFees, pool.asset?.type, e.instant_withdraw_fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
    addAmount(dailyRevenue, pool.asset?.type, e.instant_withdraw_fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Gross AlphaFi strategy yield emitted by autocompound/reward events, plus deposit/withdraw and instant-withdraw fees emitted by pool events when non-zero.",
  Revenue: "Fees collected by AlphaFi, including performance fees from autocompound/reward events and deposit/withdraw fees from pool events.",
  ProtocolRevenue: "Same as revenue.",
  SupplySideRevenue: "Autocompounded yield attributed to AlphaFi vault depositors.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Yield generated by AlphaFi strategies and autocompounded for depositors.",
    [METRIC.PERFORMANCE_FEES]: "Performance fees charged by AlphaFi when vault rewards are autocompounded.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit, withdrawal, and instant-withdraw fees emitted by AlphaFi pool events.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees retained by AlphaFi.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit, withdrawal, and instant-withdraw fees retained by AlphaFi.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Yield generated by AlphaFi strategies and autocompounded for depositors.",
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
};

export default adapter;
