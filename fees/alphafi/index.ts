import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryEvents } from "../../helpers/sui";
import fetchURL from "../../utils/fetchURL";

const ALPHAFI_CONFIG_ENDPOINT = "https://api.alphafi.xyz/public/config";
const START_DATE = "2024-07-05";

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

async function safeQueryEvents(params: any): Promise<any[]> {
  try {
    return await queryEvents(params);
  } catch (e: any) {
    if (e?.message?.includes("Cannot read properties of undefined") || e instanceof TypeError) {
      return [];
    }
    throw e;
  }
}

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

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean))] as string[];
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

  const { pools, byInvestor, byPool } = await getPoolConfig();

  const autocompoundEventTypes = unique(pools.map((pool) => pool.events?.autocompound_event_type));
  for (const eventType of autocompoundEventTypes) {
    const events = await safeQueryEvents({ eventType, options });

    for (const e of events) {
      const pool = byInvestor.get(e.investor_id);
      if (!pool) continue;

      if (e.fee_collected_a !== undefined || e.fee_collected_b !== undefined) {
        addAmount(dailyFees, pool.asset_a?.type, e.fee_collected_a, METRIC.PERFORMANCE_FEES);
        addAmount(dailyFees, pool.asset_b?.type, e.fee_collected_b, METRIC.PERFORMANCE_FEES);
        addAmount(dailyRevenue, pool.asset_a?.type, e.fee_collected_a, METRIC.PERFORMANCE_FEES);
        addAmount(dailyRevenue, pool.asset_b?.type, e.fee_collected_b, METRIC.PERFORMANCE_FEES);
      } else if (e.fee_collected !== undefined) {
        const token = eventCoinType(e) ?? pool.asset?.type;
        addAmount(dailyFees, token, e.fee_collected, METRIC.PERFORMANCE_FEES);
        addAmount(dailyRevenue, token, e.fee_collected, METRIC.PERFORMANCE_FEES);
      }
    }
  }

  const liquidityChangeEventTypes = unique(pools.map((pool) => pool.events?.liquidity_change_event_type));
  for (const eventType of liquidityChangeEventTypes) {
    const events = await safeQueryEvents({ eventType, options });

    for (const e of events) {
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
  }

  const withdrawEventTypes = unique(pools.map((pool) => pool.events?.withdraw_v2_event_type));
  for (const eventType of withdrawEventTypes) {
    const events = await safeQueryEvents({ eventType, options });

    for (const e of events) {
      const pool = byPool.get(e.pool_id);
      if (!pool) continue;

      addAmount(dailyFees, pool.asset?.type, e.instant_withdraw_fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
      addAmount(dailyRevenue, pool.asset?.type, e.instant_withdraw_fee_collected, METRIC.DEPOSIT_WITHDRAW_FEES);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const methodology = {
  Fees: "AlphaFi performance fees emitted by autocompound/reward events, plus deposit/withdraw and instant-withdraw fees emitted by pool events when non-zero.",
  Revenue: "Fees collected by AlphaFi. Underlying Cetus, Bluefin, NAVI, AlphaLend, and Slush yield is not counted unless it is emitted as AlphaFi's fee_collected amount.",
  ProtocolRevenue: "Same as revenue.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees charged by AlphaFi when vault rewards are autocompounded.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit, withdrawal, and instant-withdraw fees emitted by AlphaFi pool events.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees retained by AlphaFi.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit, withdrawal, and instant-withdraw fees retained by AlphaFi.",
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
