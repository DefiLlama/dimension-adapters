import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";
import { sleep } from "../utils/utils";

const DLMM_ENDPOINT = "https://dlmm.datapi.meteora.ag/pools";
const DAMM_V1_ENDPOINT = "https://damm-api.meteora.ag/pools/search";
const DAMM_V2_GROUPS_ENDPOINT = "https://damm-v2.datapi.meteora.ag/pools/groups";
const DAMM_V2_POOLS_ENDPOINT = "https://damm-v2.datapi.meteora.ag/pools";

type Totals = {
  protocolRevenue: number;
  supplySideRevenue: number;
  unclassifiedFees: number;
};

const emptyTotals = (): Totals => ({
  protocolRevenue: 0,
  supplySideRevenue: 0,
  unclassifiedFees: 0,
});

const asNumber = (value: any) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const isWashLike = (tvl: number, volume: number) => tvl < 1_000_000 && volume > tvl * 10;

async function fetchDlmmFees() {
  const totals = emptyTotals();
  const pageSize = 100;
  let page = 1;

  while (true) {
    const response = await httpGet(`${DLMM_ENDPOINT}?page=${page}&page_size=${pageSize}`);
    const pools = response.data || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      const tvl = asNumber(pool.tvl);
      const volume = asNumber(pool.volume?.["24h"]);
      if (pool.is_blacklisted || isWashLike(tvl, volume)) continue;

      const fees = asNumber(pool.fees?.["24h"]);
      const protocolFees = asNumber(pool.protocol_fees?.["24h"]);

      totals.protocolRevenue += protocolFees;
      totals.supplySideRevenue += Math.max(fees - protocolFees, 0);
    }

    const lastPool = pools[pools.length - 1];
    if (asNumber(lastPool?.volume?.["24h"]) < 1000 || pools.length < pageSize) break;

    await sleep(100);
    page++;
  }

  return totals;
}

async function fetchDammV1Fees() {
  const totals = emptyTotals();
  const pageSize = 300;
  let page = 0;

  while (true) {
    const response = await httpGet(`${DAMM_V1_ENDPOINT}?page=${page}&size=${pageSize}&hide_low_tvl=10000`);
    const pools = response.data || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      const fees = asNumber(pool.fee_volume);
      totals.unclassifiedFees += fees;
    }

    if (pools.length < pageSize) break;

    await sleep(100);
    page++;
  }

  return totals;
}

async function fetchDammV2Fees() {
  const totals = emptyTotals();
  const nonBlacklistedGroups = new Set<string>();
  const groupsPageSize = 99;
  let groupPage = 1;

  while (true) {
    const response = await httpGet(
      `${DAMM_V2_GROUPS_ENDPOINT}?page=${groupPage}&page_size=${groupsPageSize}&sort_by=tvl%3Adesc&filter_by=is_blacklisted%3A%3Dfalse&fee_tvl_ratio_tw=fee_tvl_ratio_24h&volume_tw=volume_24h`
    );
    const pools = response.data || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      const tvl = asNumber(pool.total_tvl);
      const volume = asNumber(pool.total_volume);
      if (isWashLike(tvl, volume)) continue;

      if (pool.group_name) nonBlacklistedGroups.add(pool.group_name);
    }

    const lastPool = pools[pools.length - 1];
    if (asNumber(lastPool?.total_tvl) < 1000 || pools.length < groupsPageSize) break;

    await sleep(100);
    groupPage++;
  }

  const poolsPageSize = 1000;
  let poolsPage = 1;

  while (true) {
    const response = await httpGet(
      `${DAMM_V2_POOLS_ENDPOINT}?is_blacklisted=false&tvl>=10000&page=${poolsPage}&page_size=${poolsPageSize}`
    );
    const pools = response.data || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      const tvl = asNumber(pool.tvl);
      const volume = asNumber(pool.volume?.["24h"]);
      if (!nonBlacklistedGroups.has(pool.name) || isWashLike(tvl, volume)) continue;

      const fees = asNumber(pool.fees?.["24h"]);
      const protocolFeeRatio = Math.min(
        Math.max(asNumber(pool.pool_config?.protocol_fee_pct) / 100, 0),
        1
      );
      const protocolFees = fees * protocolFeeRatio;

      totals.protocolRevenue += protocolFees;
      totals.supplySideRevenue += Math.max(fees - protocolFees, 0);
    }

    const lastPool = pools[pools.length - 1];
    if (asNumber(lastPool?.fees?.["24h"]) < 10 || pools.length < poolsPageSize) break;

    await sleep(100);
    poolsPage++;
  }

  return totals;
}

const fetch = async (options: FetchOptions) => {
  const [dlmm, dammV1, dammV2] = await Promise.all([
    fetchDlmmFees(),
    fetchDammV1Fees(),
    fetchDammV2Fees(),
  ]);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(dlmm.supplySideRevenue + dammV2.supplySideRevenue, METRIC.LP_FEES);
  dailyFees.addUSDValue(dlmm.protocolRevenue + dammV2.protocolRevenue, METRIC.PROTOCOL_FEES);
  dailyFees.addUSDValue(dammV1.unclassifiedFees, METRIC.SWAP_FEES);

  dailyRevenue.addUSDValue(dlmm.protocolRevenue + dammV2.protocolRevenue, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(dlmm.supplySideRevenue + dammV2.supplySideRevenue, METRIC.LP_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: "2023-11-07",
    },
  },
  methodology: {
    Fees: "Trading fees paid by users across Meteora DLMM, DAMM v1, and DAMM v2. DAMM v1 fees are included as unclassified swap fees because the public API does not expose a protocol/LP split.",
    Revenue: "Protocol fee share exposed by Meteora DLMM and DAMM v2 pool data.",
    ProtocolRevenue: "Protocol fee share exposed by Meteora DLMM and DAMM v2 pool data.",
    SupplySideRevenue: "LP fee share exposed by Meteora DLMM and DAMM v2 pool data.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.LP_FEES]: "LP fee share from Meteora DLMM and DAMM v2.",
      [METRIC.PROTOCOL_FEES]: "Protocol fee share from Meteora DLMM and DAMM v2.",
      [METRIC.SWAP_FEES]: "Unclassified DAMM v1 swap fees from the Meteora public API.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol fee share from Meteora DLMM and DAMM v2.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol fee share from Meteora DLMM and DAMM v2.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "LP fee share from Meteora DLMM and DAMM v2.",
    },
  },
};

export default adapter;
