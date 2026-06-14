import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";

const PHAR_TOKEN_CONTRACT = "0x13A466998Ce03Db73aBc2d4DF3bBD845Ed1f28E7";

export const subgraphEndpoints: any = {
  [CHAIN.AVAX]: "https://avalanchev2.kingdomsubgraph.com/subgraphs/name/pharaoh-v3-pruned/",
};

const subgraphQueryLimit = 1000;

const historicalRollupAgeSeconds = 25 * 60 * 60;

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

interface IProtocolDayData {
  startOfDay: number;
  volumeUsd: string;
  feesUsd: string;
  voterFeesUsd: string;
  treasuryFeesUsd: string;
}

interface IPoolHourStats {
  volumeUSD: number;
  feesUSD: number;
  voterFeesUSD: number;
  treasuryFeesUSD: number;
}

interface IVoteBribe {
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
      from: options.startTimestamp,
      to: options.endTimestamp,
      first,
      skip,
    }).then((data) => data.voteBribes);

  return paginate<IVoteBribe>(getData, subgraphQueryLimit);
}

async function getTokens(options: FetchOptions, tokens: string[]) {
  const tokenIds = tokens.map((e) => `"${e}"`).join(",");
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
      data.tokenDayDatas.map((td: any) => ({
        id: td.token.id,
        priceUSD: td.priceUSD,
      }))
    );

  return paginate<IToken>(getData, subgraphQueryLimit);
}

function shouldUseDayRollups(options: FetchOptions) {
  return Math.floor(Date.now() / 1000) - options.endTimestamp > historicalRollupAgeSeconds;
}

function getStartOfDay(timestamp: number) {
  return Math.floor(timestamp / (24 * 60 * 60)) * 24 * 60 * 60;
}

function getWindowStartOfDays(options: FetchOptions) {
  const days = new Set<number>();
  const firstDay = getStartOfDay(options.startTimestamp);
  const lastDay = getStartOfDay(options.endTimestamp - 1);

  for (let day = firstDay; day <= lastDay; day += 24 * 60 * 60) {
    days.add(day);
  }
  days.add(options.startOfDay);

  return Array.from(days);
}

async function fetchPoolHourStats(
  options: FetchOptions,
  root: "clPoolHourDatas" | "legacyPoolHourDatas",
  dayStats: IProtocolDayData[],
): Promise<IPoolHourStats> {
  const query = gql`
    query poolHourStats($from: Int!, $to: Int!, $first: Int!, $skip: Int!) {
      items: ${root}(
        first: $first
        skip: $skip
        where: { startOfHour_gte: $from, startOfHour_lt: $to }
      ) {
        startOfHour
        volumeUSD
        feesUSD
        treasuryFeesUSD
      }
    }
  `;

  const items = await paginate<{
    startOfHour?: string;
    volumeUSD?: string;
    feesUSD?: string;
    treasuryFeesUSD?: string;
  }>(
    (first, skip) => request<any>(subgraphEndpoints[options.chain], query, {
      from: options.startTimestamp,
      to: options.endTimestamp,
      first,
      skip,
    }).then((data) => data.items),
    subgraphQueryLimit,
  );

  const dayStatsByStart = new Map(dayStats.map((day) => [Number(day.startOfDay), day]));
  const dayTotals = new Map<number, { feesUSD: number; treasuryFeesUSD: number }>();

  for (const item of items) {
    const day = getStartOfDay(Number(item.startOfHour ?? 0));
    const totals = dayTotals.get(day) ?? { feesUSD: 0, treasuryFeesUSD: 0 };
    totals.feesUSD += Number(item.feesUSD ?? 0);
    totals.treasuryFeesUSD += Number(item.treasuryFeesUSD ?? 0);
    dayTotals.set(day, totals);
  }

  const voterFeesUSD = Array.from(dayTotals).reduce((sum, [day, totals]) => {
    const dayData = dayStatsByStart.get(day);
    const dayFeesUSD = Number(dayData?.feesUsd ?? 0);
    const dayVoterFeesUSD = Number(dayData?.voterFeesUsd ?? 0);
    const dayTreasuryFeesUSD = Number(dayData?.treasuryFeesUsd ?? 0);
    const dayNonTreasuryFeesUSD = dayFeesUSD - dayTreasuryFeesUSD;
    const windowNonTreasuryFeesUSD = totals.feesUSD - totals.treasuryFeesUSD;

    if (dayNonTreasuryFeesUSD <= 0 || windowNonTreasuryFeesUSD <= 0) return sum;

    return sum + windowNonTreasuryFeesUSD * dayVoterFeesUSD / dayNonTreasuryFeesUSD;
  }, 0);

  return {
    volumeUSD: items.reduce((sum, item) => sum + Number(item.volumeUSD ?? 0), 0),
    feesUSD: items.reduce((sum, item) => sum + Number(item.feesUSD ?? 0), 0),
    voterFeesUSD,
    treasuryFeesUSD: items.reduce((sum, item) => sum + Number(item.treasuryFeesUSD ?? 0), 0),
  };
}

export async function fetchStats(options: FetchOptions): Promise<IGraphRes> {
  const statsQuery = gql`
    query getProtocolDayData($startOfDays: [Int!]!) {
      ClProtocolDayData: clProtocolDayDatas(where: { startOfDay_in: $startOfDays }) {
        startOfDay
        volumeUsd: volumeUSD
        feesUsd: feesUSD
        voterFeesUsd: voterFeesUSD
        treasuryFeesUsd: treasuryFeesUSD
      }
      LegacyProtocolDayData: legacyProtocolDayDatas(where: { startOfDay_in: $startOfDays }) {
        startOfDay
        volumeUsd: volumeUSD
        feesUsd: feesUSD
        voterFeesUsd: voterFeesUSD
        treasuryFeesUsd: treasuryFeesUSD
      }
    }
  `;

  const {
    ClProtocolDayData: clProtocolDayData,
    LegacyProtocolDayData: legacyProtocolDayData,
  } = await request(subgraphEndpoints[options.chain], statsQuery, {
    startOfDays: getWindowStartOfDays(options),
  });
  const clDayData = clProtocolDayData?.find((day: IProtocolDayData) => Number(day.startOfDay) === options.startOfDay);
  const legacyDayData = legacyProtocolDayData?.find((day: IProtocolDayData) => Number(day.startOfDay) === options.startOfDay);
  const voteBribes = await getBribes(options);
  const tokenIds = new Set(voteBribes.map((e) => e.token.id));
  tokenIds.add(PHAR_TOKEN_CONTRACT.toLowerCase());
  const tokens = await getTokens(options, Array.from(tokenIds));
  const legacyVoteBribes = voteBribes.filter((e) => e.legacyPool);
  const clVoteBribes = voteBribes.filter((e) => e.clPool);

  const legacyUserBribeRevenueUSD = legacyVoteBribes.reduce((acc, bribe) => {
    const token = tokens.find((t) => t.id === bribe.token.id);
    return acc + Number(bribe.amount) * Number(token?.priceUSD ?? 0);
  }, 0);
  const clUserBribeRevenueUSD = clVoteBribes.reduce((acc, bribe) => {
    const token = tokens.find((t) => t.id === bribe.token.id);
    return acc + Number(bribe.amount) * Number(token?.priceUSD ?? 0);
  }, 0);

  const clDayFeesUSD = Number(clDayData?.feesUsd ?? 0);
  const clDayVoterFeesUSD = Number(clDayData?.voterFeesUsd ?? 0);
  const clDayTreasuryFeesUSD = Number(clDayData?.treasuryFeesUsd ?? 0);
  const legacyDayFeesUSD = Number(legacyDayData?.feesUsd ?? 0);
  const legacyDayVoterFeesUSD = Number(legacyDayData?.voterFeesUsd ?? 0);
  const legacyDayTreasuryFeesUSD = Number(legacyDayData?.treasuryFeesUsd ?? 0);
  const useDayRollups = shouldUseDayRollups(options);
  const [clStats, legacyStats] = await Promise.all([
    useDayRollups
      ? Promise.resolve({
        volumeUSD: Number(clDayData?.volumeUsd ?? 0),
        feesUSD: clDayFeesUSD,
        voterFeesUSD: clDayVoterFeesUSD,
        treasuryFeesUSD: clDayTreasuryFeesUSD,
      })
      : fetchPoolHourStats(options, "clPoolHourDatas", clProtocolDayData),
    useDayRollups
      ? Promise.resolve({
        volumeUSD: Number(legacyDayData?.volumeUsd ?? 0),
        feesUSD: legacyDayFeesUSD,
        voterFeesUSD: legacyDayVoterFeesUSD,
        treasuryFeesUSD: legacyDayTreasuryFeesUSD,
      })
      : fetchPoolHourStats(options, "legacyPoolHourDatas", legacyProtocolDayData),
  ]);

  return {
    clVolumeUSD: clStats.volumeUSD,
    clFeesUSD: clStats.feesUSD,
    legacyVolumeUSD: legacyStats.volumeUSD,
    legacyFeesUSD: legacyStats.feesUSD,
    clBribeRevenueUSD: clUserBribeRevenueUSD,
    legacyBribeRevenueUSD: legacyUserBribeRevenueUSD,
    clUserFeesRevenueUSD: clStats.voterFeesUSD,
    legacyUserFeesRevenueUSD: legacyStats.voterFeesUSD,
    clProtocolRevenueUSD: clStats.treasuryFeesUSD,
    legacyProtocolRevenueUSD: legacyStats.treasuryFeesUSD,
  };
};

const fetch = async (options: FetchOptions) => {
  const stats = await fetchStats(options);

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  dailyFees.addUSDValue(stats.clFeesUSD, 'Token Swap Fees')
  dailyFees.addUSDValue(stats.clBribeRevenueUSD, 'Bribes Rewards')

  dailyRevenue.addUSDValue(stats.clUserFeesRevenueUSD, 'Token Swap Fees To Holders')
  dailyRevenue.addUSDValue(stats.clProtocolRevenueUSD, 'Token Swap Fees To Protocol')
  dailyRevenue.addUSDValue(stats.clBribeRevenueUSD, 'Bribes Revenue')

  dailyHoldersRevenue.addUSDValue(stats.clUserFeesRevenueUSD, 'Token Swap Fees To Holders')
  dailyHoldersRevenue.addUSDValue(stats.clBribeRevenueUSD, 'Bribes Revenue')

  dailyProtocolRevenue.addUSDValue(stats.clProtocolRevenueUSD, 'Token Swap Fees To Protocol')

  dailySupplySideRevenue.addUSDValue(stats.clFeesUSD - stats.clUserFeesRevenueUSD - stats.clProtocolRevenueUSD, 'Token Swap Fees To LPs')

  return {
    dailyVolume: stats.clVolumeUSD,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Fees are collected from users on each swap + bribes revenue.",
  Revenue: "Revenue going to the protocol + Token holder Revenue.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  SupplySideRevenue: "Fees distributed to LPs (from gauged pools).",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.AVAX],
  start: '2025-10-08',
  methodology,
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees paid by users on Pharaoh concentrated liquidity pools.',
      'Bribes Rewards': 'Vote bribes deposited for Pharaoh concentrated liquidity pools.',
    },
    UserFees: {
      'Token Swap Fees': 'Swap fees paid by users on Pharaoh concentrated liquidity pools.',
      'Bribes Rewards': 'Vote bribes deposited for Pharaoh concentrated liquidity pools.',
    },
    Revenue: {
      'Token Swap Fees To Holders': 'Portion of concentrated liquidity swap fees distributed to xPHAR holders.',
      'Token Swap Fees To Protocol': 'Treasury portion of concentrated liquidity swap fees.',
      'Bribes Revenue': 'Vote bribes distributed to xPHAR holders.',
    },
    ProtocolRevenue: {
      'Token Swap Fees To Protocol': 'Treasury portion of concentrated liquidity swap fees.',
    },
    HoldersRevenue: {
      'Token Swap Fees To Holders': 'Portion of concentrated liquidity swap fees distributed to xPHAR holders.',
      'Bribes Revenue': 'Vote bribes distributed to xPHAR holders.',
    },
    SupplySideRevenue: {
      'Token Swap Fees To LPs': 'Concentrated liquidity swap fees retained by LPs after holder and treasury fee shares.',
    },
  }
};

export default adapter;
