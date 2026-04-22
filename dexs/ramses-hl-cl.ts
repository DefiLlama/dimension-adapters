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

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const stats = await fetchStats(options);

  const dailyVolume = stats.clVolumeUSD;

  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(stats.clFeesUSD, METRIC.SWAP_FEES);
  dailyHoldersRevenue.addUSDValue(stats.clUserFeesRevenueUSD, 'Swap Fees to holders');
  dailyProtocolRevenue.addUSDValue(stats.clProtocolRevenueUSD, 'Swap Fees to protocol');

  dailyFees.addUSDValue(stats.clBribeRevenueUSD, 'Bribes');
  dailyHoldersRevenue.addUSDValue(stats.clBribeRevenueUSD, 'Bribes to holders');

  const dailyRevenue = dailyProtocolRevenue.clone();
  dailyRevenue.add(dailyHoldersRevenue);

  dailySupplySideRevenue.addUSDValue(stats.clFeesUSD - stats.clUserFeesRevenueUSD - stats.clProtocolRevenueUSD, 'Swap Fees to LPs');

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

export const methodology = {
  Fees: "Fees are collected from users on each swap.",
  Revenue: "Revenue going to the protocol + Token holder Revenue.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  SupplySideRevenue: "Fees distributed to LPs (from gauged pools).",
};

export const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees are collected from users on each swap.",
    ["Bribes"]: "Bribes paid by protocols",
  },
  Revenue: {
    ["Swap Fees to protocol"]: "Revenue going to the protocol.",
    ["Swap Fees to holders"]: "User fees are distributed among holders.",
    ["Bribes to holders"]: "Bribes paid by protocols",
  },
  ProtocolRevenue: {
    ["Swap Fees to protocol"]: "Revenue going to the protocol.",
  },
  SupplySideRevenue: {
    ["Swap Fees to LPs"]: "Fees distributed to LPs (from gauged pools).",
  },
  HoldersRevenue: {
    ["Swap Fees to holders"]: "User fees are distributed among holders.",
    ["Bribes to holders"]: "Bribes paid by protocols",
  },
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-11-08',
  methodology,
  breakdownMethodology,
};

export default adapter;
