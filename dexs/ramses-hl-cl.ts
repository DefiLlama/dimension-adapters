import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";
import { METRIC } from "../helpers/metrics";

const RAM_TOKEN_CONTRACT = "0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555";
const XRAM_TOKEN_CONTRACT = "	0xAE6D5FcE541216BDA471D311425B5412D9f1DEb9";

export const subgraphEndpoints: any = {
  [CHAIN.ARBITRUM]: "https://arbitrumv2.kingdomsubgraph.com/subgraphs/name/ramses-pruned",
  [CHAIN.HYPERLIQUID]: "https://hyperevm.kingdomsubgraph.com/subgraphs/name/ramses-v3-pruned/",
  [CHAIN.POLYGON]: "https://polygon.kingdomsubgraph.com/subgraphs/name/ramses-pruned",
};

const subgraphQueryLimit = 1000;

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
    }).then((data) => data.voteBribes);

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
    }).then((data) =>
      // Transform tokenDayDatas to match expected token format
      data.tokenDayDatas.map((td: any) => ({
        id: td.token.id,
        priceUSD: td.priceUSD,
      }))
    );

  return paginate<IToken>(getData, subgraphQueryLimit);
}

export async function fetchStats(options: FetchOptions): Promise<IGraphRes> {
  const protocolDayStats = await fetchProtocolDayStats(options);

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

type PoolType = 'cl' | 'legacy';

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

function createFetchHandler(poolType: PoolType) {
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

const fetch = createFetchHandler('cl');

export const methodology = {
  Fees: "Includes swap fees and bribes paid by protocols",
  Revenue: "Revenue going to the protocol + Token holder Revenue.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Swap fees going to the protocol",
  HoldersRevenue: "Swap fees distributed to holders and all the bribes go to holders",
  SupplySideRevenue: "Swap fees distributed to LPs (from gauged pools).",
};

export const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees are collected from users on each swap.",
    ["Bribes"]: "Bribes paid by protocols",
  },
  Revenue: {
    ["Swap Fees to protocol"]: "Revenue going to the protocol.",
    ["Swap Fees to holders"]: "User fees are distributed among holders.",
    ["Bribes to holders"]: "Bribes paid by protocols to holders",
  },
  ProtocolRevenue: {
    ["Swap Fees to protocol"]: "Revenue going to the protocol.",
  },
  SupplySideRevenue: {
    ["Swap Fees to LPs"]: "Fees distributed to LPs (from gauged pools).",
  },
  HoldersRevenue: {
    ["Swap Fees to holders"]: "User fees are distributed among holders.",
    ["Bribes to holders"]: "Bribes paid by protocols to holders",
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

const legacyFetch = createFetchHandler('legacy');

export function createLegacyAdapter(chain: string, start: string): SimpleAdapter {
  return {
    fetch: legacyFetch,
    chains: [chain],
    start,
    methodology,
    breakdownMethodology,
  };
}

const adapter: SimpleAdapter = createClAdapter(CHAIN.HYPERLIQUID, '2025-11-08');

export default adapter;
