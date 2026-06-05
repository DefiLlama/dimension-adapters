import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";
import { METRIC } from "../helpers/metrics";
import { getAdapter } from "../factory/uniV2";

const RAM_TOKEN_CONTRACT = "0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555";
const XRAM_TOKEN_CONTRACT = "	0xAE6D5FcE541216BDA471D311425B5412D9f1DEb9";

export const subgraphEndpoints: any = {
  [CHAIN.ARBITRUM]: "https://arbitrumv2.kingdomsubgraph.com/subgraphs/name/ramses-pruned",
  [CHAIN.HYPERLIQUID]: "https://hyperevm.kingdomsubgraph.com/subgraphs/name/ramses-v3-pruned/",
  [CHAIN.POLYGON]: "https://polygon.kingdomsubgraph.com/subgraphs/name/ramses-pruned",
};

const subgraphQueryLimit = 1000;
const clArbitrumCutover = Date.UTC(2026, 0, 13) / 1000;
const legacyArbitrumCutover = Date.UTC(2026, 0, 28) / 1000;

interface IGraphRes {
  clVolumeUSD: number;
  clFeesUSD: number;
  legacyVolumeUSD: number;
  legacyFeesUSD: number;
  clBribeRevenueUSD: number;
  legacyBribeRevenueUSD: number;
  clProtocolRevenueUSD: number;
  legacyProtocolRevenueUSD: number;
  clUserFeesRevenueUSD: number;
  legacyUserFeesRevenueUSD: number;
}

type IProtocolDayStats = Omit<IGraphRes, "clBribeRevenueUSD" | "legacyBribeRevenueUSD">;

interface IVoteBribe {
  id: string;
  token: { id: string };
  legacyPool?: { id: string };
  clPool?: { id: string };
  amount: string;
}

interface IToken {
  id: string;
  priceUSD: string;
}

interface IPoolHourData {
  startOfHour: string;
  volumeUSD: string;
  feesUSD: string;
  voterFeesUSD: string;
  treasuryFeesUSD: string;
}

interface IPoolWithHourData {
  poolHourData: IPoolHourData[];
}

async function paginate<T>(
  getItems: (first: number, skip: number) => Promise<T[]>,
  itemsPerPage: number,
): Promise<T[]> {
  const items = new Array<T>();
  let skip = 0;
  while (true) {
    const newItems = await getItems(itemsPerPage, skip);

    items.push(...newItems);
    skip += itemsPerPage;

    if (newItems.length < itemsPerPage) {
      break;
    }

    // add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return items;
}

async function getBribes(options: FetchOptions) {
  const query = gql`
    query bribes($from: Int!, $to: Int!, $first: Int!, $skip: Int!) {
      voteBribes(
        first: $first
        skip: $skip
        where: { timestamp_gte: $from, timestamp_lte: $to }
      ) {
        token {
          id
        }
        legacyPool {
          id
        }
        clPool {
          id
        }
        amount
      }
    }
  `;

  const getData = async (first: number, skip: number) =>
    request<any>(subgraphEndpoints[options.chain], query, {
      from: options.startOfDay,
      to: options.startOfDay + 24 * 60 * 60,
      first,
      skip,
    }).then((data: any) => data.voteBribes);

  return paginate<IVoteBribe>(getData, subgraphQueryLimit);
}

async function getTokens(options: FetchOptions, tokens: string[]) {
  const tokenIds = tokens.map((e) => `"${e}"`).join(",");

  // Use tokenDayDatas for historical prices instead of block-based queries
  const query = gql`
    query tokenDayDatas($first: Int!, $skip: Int!, $startOfDay: Int!) {
      tokenDayDatas(
        first: $first
        skip: $skip
        where: { 
          startOfDay: $startOfDay
          token_in: [${tokenIds}]
        }
      ) {
        id
        token {
          id
        }
        priceUSD
      }
    }
  `;

  const getData = async (first: number, skip: number) =>
    request<any>(subgraphEndpoints[options.chain], query, {
      first,
      skip,
      startOfDay: options.startOfDay,
    }).then((data: any) =>
      // Transform tokenDayDatas to match expected token format
      data.tokenDayDatas.map((td: any) => ({
        id: td.token.id,
        priceUSD: td.priceUSD,
      }))
    );

  return paginate<IToken>(getData, subgraphQueryLimit);
}

export async function fetchStats(options: FetchOptions): Promise<IGraphRes> {
  const protocolDayStats = await fetchRecentProtocolStats(options) ?? await fetchProtocolDayStats(options);

  const voteBribes = await getBribes(options);
  const tokenIds = new Set(voteBribes.map((e) => e.token.id));
  tokenIds.add(RAM_TOKEN_CONTRACT.toLowerCase());

  const tokens = await getTokens(options, Array.from(tokenIds));

  const legacyVoteBribes = voteBribes.filter((e) => e.legacyPool);
  const clVoteBribes = voteBribes.filter((e) => e.clPool);

  const clUserBribeRevenueUSD = clVoteBribes.reduce((acc, bribe) => {
    const token = tokens.find((t) => t.id === bribe.token.id);
    return acc + Number(bribe.amount) * Number(token?.priceUSD ?? 0);
  }, 0);
  const legacyUserBribeRevenueUSD = legacyVoteBribes.reduce((acc, bribe) => {
    const token = tokens.find((t) => t.id === bribe.token.id);
    return acc + Number(bribe.amount) * Number(token?.priceUSD ?? 0);
  }, 0);

  return {
    ...protocolDayStats,
    clBribeRevenueUSD: clUserBribeRevenueUSD,
    legacyBribeRevenueUSD: legacyUserBribeRevenueUSD,
  };
};

const statsQuery = gql`
  query getProtocolDayData($startOfDay: Int!) {
    ClProtocolDayData: clProtocolDayDatas(where: { startOfDay: $startOfDay }) {
      startOfDay
      volumeUsd: volumeUSD
      feesUsd: feesUSD
      voterFeesUsd: voterFeesUSD
      treasuryFeesUsd: treasuryFeesUSD
    }
    LegacyProtocolDayData: legacyProtocolDayDatas(where: { startOfDay: $startOfDay }) {
      startOfDay
      volumeUsd: volumeUSD
      feesUsd: feesUSD
      voterFeesUsd: voterFeesUSD
      treasuryFeesUsd: treasuryFeesUSD
    }
  }
`;

export async function fetchProtocolDayStats(
  options: FetchOptions,
): Promise<IProtocolDayStats> {
  const {
    ClProtocolDayData: clProtocolDayData,
    LegacyProtocolDayData: legacyProtocolDayData,
  } = await request(subgraphEndpoints[options.chain], statsQuery, {
    startOfDay: options.startOfDay,
  });

  return {
    clVolumeUSD: Number(clProtocolDayData?.[0]?.volumeUsd ?? 0),
    clFeesUSD: Number(clProtocolDayData?.[0]?.feesUsd ?? 0),
    legacyVolumeUSD: Number(legacyProtocolDayData?.[0]?.volumeUsd ?? 0),
    legacyFeesUSD: Number(legacyProtocolDayData?.[0]?.feesUsd ?? 0),
    clUserFeesRevenueUSD: Number(clProtocolDayData?.[0]?.voterFeesUsd ?? 0),
    legacyUserFeesRevenueUSD: Number(
      legacyProtocolDayData?.[0]?.voterFeesUsd ?? 0,
    ),
    clProtocolRevenueUSD: Number(clProtocolDayData?.[0]?.treasuryFeesUsd ?? 0),
    legacyProtocolRevenueUSD: Number(
      legacyProtocolDayData?.[0]?.treasuryFeesUsd ?? 0,
    ),
  };
}

function emptyPoolStats() {
  return {
    volumeUSD: 0,
    feesUSD: 0,
    userFeesRevenueUSD: 0,
    protocolRevenueUSD: 0,
  };
}

function addPoolHours(stats: ReturnType<typeof emptyPoolStats>, poolHourData: IPoolHourData[], fromTimestamp: number, toTimestamp: number) {
  poolHourData
    .filter((hour) => Number(hour.startOfHour) >= fromTimestamp && Number(hour.startOfHour) < toTimestamp)
    .forEach((hour) => {
      stats.volumeUSD += Number(hour.volumeUSD ?? 0);
      stats.feesUSD += Number(hour.feesUSD ?? 0);
      stats.userFeesRevenueUSD += Number(hour.voterFeesUSD ?? 0);
      stats.protocolRevenueUSD += Number(hour.treasuryFeesUSD ?? 0);
    });
}

async function fetchPoolHourStats(options: FetchOptions, poolType: PoolType) {
  const poolField = poolType === 'cl' ? 'clPools' : 'legacyPools';
  const query = gql`
    query poolHourStats($first: Int!, $skip: Int!) {
      ${poolField}(first: $first, skip: $skip) {
        poolHourData(first: 48, orderBy: startOfHour, orderDirection: desc) {
          startOfHour
          volumeUSD
          feesUSD
          voterFeesUSD
          treasuryFeesUSD
        }
      }
    }
  `;

  const pools = await paginate<IPoolWithHourData>(
    async (first, skip) => request<any>(subgraphEndpoints[options.chain], query, { first, skip }).then((data: any) => data[poolField]),
    subgraphQueryLimit,
  );

  const stats = emptyPoolStats();
  pools.forEach((pool) => addPoolHours(stats, pool.poolHourData ?? [], options.fromTimestamp, options.toTimestamp));

  return stats;
}

async function fetchRecentProtocolStats(options: FetchOptions): Promise<IProtocolDayStats | null> {
  if (options.toTimestamp < Math.floor(Date.now() / 1000) - 48 * 60 * 60) return null;

  const [clStats, legacyStats] = await Promise.all([
    fetchPoolHourStats(options, 'cl'),
    fetchPoolHourStats(options, 'legacy'),
  ]);

  const totalVolume = clStats.volumeUSD + legacyStats.volumeUSD;
  const totalFees = clStats.feesUSD + legacyStats.feesUSD;
  if (totalVolume === 0 && totalFees === 0) return null;

  return {
    clVolumeUSD: clStats.volumeUSD,
    clFeesUSD: clStats.feesUSD,
    legacyVolumeUSD: legacyStats.volumeUSD,
    legacyFeesUSD: legacyStats.feesUSD,
    clUserFeesRevenueUSD: clStats.userFeesRevenueUSD,
    legacyUserFeesRevenueUSD: legacyStats.userFeesRevenueUSD,
    clProtocolRevenueUSD: clStats.protocolRevenueUSD,
    legacyProtocolRevenueUSD: legacyStats.protocolRevenueUSD,
  };
}

export type PoolType = 'cl' | 'legacy';

type ChainConfig = {
  chain: string;
  start: string;
};

interface PoolStats {
  volumeUSD: number;
  feesUSD: number;
  userFeesRevenueUSD: number;
  protocolRevenueUSD: number;
  bribeRevenueUSD: number;
}

function getPoolStats(stats: IGraphRes, poolType: PoolType): PoolStats {
  if (poolType === 'legacy') {
    return {
      volumeUSD: stats.legacyVolumeUSD,
      feesUSD: stats.legacyFeesUSD,
      userFeesRevenueUSD: stats.legacyUserFeesRevenueUSD,
      protocolRevenueUSD: stats.legacyProtocolRevenueUSD,
      bribeRevenueUSD: stats.legacyBribeRevenueUSD,
    };
  }
  return {
    volumeUSD: stats.clVolumeUSD,
    feesUSD: stats.clFeesUSD,
    userFeesRevenueUSD: stats.clUserFeesRevenueUSD,
    protocolRevenueUSD: stats.clProtocolRevenueUSD,
    bribeRevenueUSD: stats.clBribeRevenueUSD,
  };
}

export function createPoolFetchHandler(poolType: PoolType) {
  return async (_: any, _1: any, options: FetchOptions) => {
    const stats = await fetchStats(options);
    const poolStats = getPoolStats(stats, poolType);

    const dailyVolume = poolStats.volumeUSD;

    const dailyFees = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyFees.addUSDValue(poolStats.feesUSD, METRIC.SWAP_FEES);
    dailyHoldersRevenue.addUSDValue(poolStats.userFeesRevenueUSD, 'Swap Fees to holders');
    dailyProtocolRevenue.addUSDValue(poolStats.protocolRevenueUSD, 'Swap Fees to protocol');

    dailyFees.addUSDValue(poolStats.bribeRevenueUSD, 'Bribes');
    dailyHoldersRevenue.addUSDValue(poolStats.bribeRevenueUSD, 'Bribes to holders');

    const dailyRevenue = dailyProtocolRevenue.clone();
    dailyRevenue.add(dailyHoldersRevenue);

    dailySupplySideRevenue.addUSDValue(
      poolStats.feesUSD - poolStats.userFeesRevenueUSD - poolStats.protocolRevenueUSD,
      'Swap Fees to LPs'
    );

    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyHoldersRevenue,
      dailyProtocolRevenue,
      dailyRevenue,
      dailySupplySideRevenue,
    };
  };
}

const fetch = createPoolFetchHandler('cl');

export const methodology = {
  Fees: "Swap fees paid by traders and incentives paid by protocols.",
  Revenue: "Protocol swap fees plus fees and incentives distributed to veRAM voters.",
  UserFees: "Swap fees paid by traders.",
  ProtocolRevenue: "Protocol share of swap fees.",
  HoldersRevenue: "Swap fees and incentives distributed to veRAM voters.",
  SupplySideRevenue: "Swap fees retained by liquidity providers.",
};

export const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders.",
    ["Bribes"]: "Incentives paid by protocols.",
  },
  Revenue: {
    ["Swap Fees to protocol"]: "Protocol share of swap fees.",
    ["Swap Fees to holders"]: "Swap fees distributed to veRAM voters for the corresponding pool.",
    ["Bribes to holders"]: "Incentives distributed to veRAM voters for the corresponding pool.",
  },
  ProtocolRevenue: {
    ["Swap Fees to protocol"]: "Protocol share of swap fees.",
  },
  SupplySideRevenue: {
    ["Swap Fees to LPs"]: "Swap fees retained by liquidity providers.",
  },
  HoldersRevenue: {
    ["Swap Fees to holders"]: "Swap fees distributed to veRAM voters for the corresponding pool.",
    ["Bribes to holders"]: "Incentives distributed to veRAM voters for the corresponding pool.",
  },
};

export function createClAdapter(chain: string, start: string): SimpleAdapter {
  return {
    fetch,
    chains: [chain],
    start,
    methodology,
    breakdownMethodology,
  };
}

const legacyFetch = createPoolFetchHandler('legacy');

export function createLegacyAdapter(chain: string, start: string): SimpleAdapter {
  return {
    fetch: legacyFetch,
    chains: [chain],
    start,
    methodology,
    breakdownMethodology,
  };
}

export function createPoolAdapter(poolType: PoolType, chainConfigs: ChainConfig[]): SimpleAdapter {
  const fetch = createPoolFetchHandler(poolType);

  return {
    version: 1,
    adapter: chainConfigs.reduce((adapter, { chain, start }) => {
      adapter[chain] = { fetch, start };
      return adapter;
    }, {} as BaseAdapter),
    methodology,
    breakdownMethodology,
  };
}

function createConsolidatedPoolAdapter(
  poolType: PoolType,
  oldArbitrumFetch: any,
  arbitrumStart: number,
  arbitrumCutover: number,
): SimpleAdapter {
  const currentFetch = createPoolFetchHandler(poolType);
  const fetchCurrent = (timestamp: any, chainBlocks: any, options: FetchOptions) => currentFetch(timestamp, chainBlocks, options);

  return {
    version: 1,
    skipBreakdownValidation: true,
    methodology,
    breakdownMethodology,
    adapter: {
      [CHAIN.ARBITRUM]: {
        fetch: async (timestamp: any, chainBlocks: any, options: FetchOptions) => {
          if (options.startOfDay < arbitrumCutover) return oldArbitrumFetch(options as any, {} as any, options);
          return fetchCurrent(timestamp, chainBlocks, options);
        },
        start: arbitrumStart,
      },
      [CHAIN.HYPERLIQUID]: {
        fetch: fetchCurrent,
        start: '2025-11-08',
      },
      [CHAIN.POLYGON]: {
        fetch: fetchCurrent,
        start: '2026-01-28',
      },
    },
  };
}

export function createConsolidatedClAdapter(): SimpleAdapter {
  return createConsolidatedPoolAdapter(
    'cl',
    getAdapter("ramses-exchange-v2")!.fetch!,
    1685574000,
    clArbitrumCutover,
  );
}

export function createConsolidatedLegacyAdapter(): SimpleAdapter {
  return createConsolidatedPoolAdapter(
    'legacy',
    getAdapter("ramses-exchange")!.adapter![CHAIN.ARBITRUM].fetch!,
    1678838400,
    legacyArbitrumCutover,
  );
}

const adapter: SimpleAdapter = createConsolidatedClAdapter();

export default adapter;
