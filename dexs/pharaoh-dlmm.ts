import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";

const PHAR_TOKEN_CONTRACT = "0x13A466998Ce03Db73aBc2d4DF3bBD845Ed1f28E7";

const subgraphEndpoints: any = {
  [CHAIN.AVAX]: "https://avalanchev2.kingdomsubgraph.com/subgraphs/name/pharaoh-v3-pruned/",
};

const dlmmSubgraphEndpoints: any = {
  [CHAIN.AVAX]: "https://gateway.kingdom.dev/avalanche/subgraph/v1/graphql",
};

const subgraphQueryLimit = 1000;
const historicalRollupAgeSeconds = 25 * 60 * 60;
const avaxChainId = 43114;

interface IDlmmGraphRes {
  dlmmVolumeUSD: number;
  dlmmFeesUSD: number;
  dlmmBribeRevenueUSD: number;
  dlmmProtocolRevenueUSD: number;
  dlmmHoldersRevenueUSD: number;
  dlmmSupplySideRevenueUSD: number;
}

interface IDlmmStats {
  volumeUSD: number;
  feesUSD: number;
  holdersRevenueUSD: number;
  protocolRevenueUSD: number;
  supplySideRevenueUSD: number;
}

interface IVoteBribe {
  token: { id: string };
  dlmmPool?: { id: string };
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

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return items;
}

async function getDlmmBribes(options: FetchOptions) {
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
        dlmmPool {
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

function splitProtocolRevenue(protocolFeesUSD: number, dayStats: { holdersRevenueUSD: number; protocolRevenueUSD: number }) {
  const dayProtocolFeesUSD = dayStats.holdersRevenueUSD + dayStats.protocolRevenueUSD;
  if (dayProtocolFeesUSD <= 0 || protocolFeesUSD <= 0) {
    return { voterFeesUSD: 0, treasuryFeesUSD: 0 };
  }

  const ratio = protocolFeesUSD / dayProtocolFeesUSD;
  return {
    voterFeesUSD: dayStats.holdersRevenueUSD * ratio,
    treasuryFeesUSD: dayStats.protocolRevenueUSD * ratio,
  };
}

async function fetchDlmmWindowStats(options: FetchOptions) {
  const endpoint = dlmmSubgraphEndpoints[options.chain];
  const dayStatsByStart = await fetchDlmmDayStatsByStart(options, getWindowStartOfDays(options));
  const swapsQuery = gql`
    query dlmmSwaps($from: String!, $to: String!, $limit: Int!, $offset: Int!) {
      DLMMSwap(
        limit: $limit
        offset: $offset
        where: { chainId: { _eq: ${avaxChainId} }, timestamp: { _gte: $from, _lte: $to } }
      ) {
        amountUSD
      }
    }
  `;
  const feesQuery = gql`
    query dlmmFeeEvents($from: String!, $to: String!, $limit: Int!, $offset: Int!) {
      DLMMFeeEvent(
        limit: $limit
        offset: $offset
        where: { chainId: { _eq: ${avaxChainId} }, timestamp: { _gte: $from, _lte: $to } }
      ) {
        totalFeesUSD
        protocolFeesUSD
        lpFeesUSD
        timestamp
      }
    }
  `;

  const variables = {
    from: String(options.startTimestamp),
    to: String(options.endTimestamp),
  };
  const swaps = await paginate<{ amountUSD?: string }>(
    (limit, offset) => request<any>(endpoint, swapsQuery, { ...variables, limit, offset }).then((data) => data.DLMMSwap),
    subgraphQueryLimit,
  );
  const feeEvents = await paginate<{
    totalFeesUSD?: string;
    protocolFeesUSD?: string;
    lpFeesUSD?: string;
    timestamp?: string;
  }>(
    (limit, offset) => request<any>(endpoint, feesQuery, { ...variables, limit, offset }).then((data) => data.DLMMFeeEvent),
    subgraphQueryLimit,
  );

  const protocolSplit = feeEvents.reduce((sum, event) => {
    const day = getStartOfDay(Number(event.timestamp ?? 0));
    const dayStats = dayStatsByStart.get(day) ?? {
      holdersRevenueUSD: 0,
      protocolRevenueUSD: 0,
    };
    const split = splitProtocolRevenue(Number(event.protocolFeesUSD ?? 0), dayStats);

    return {
      voterFeesUSD: sum.voterFeesUSD + split.voterFeesUSD,
      treasuryFeesUSD: sum.treasuryFeesUSD + split.treasuryFeesUSD,
    };
  }, { voterFeesUSD: 0, treasuryFeesUSD: 0 });

  return {
    volumeUSD: swaps.reduce((sum, swap) => sum + Number(swap.amountUSD ?? 0), 0),
    feesUSD: feeEvents.reduce((sum, event) => sum + Number(event.totalFeesUSD ?? 0), 0),
    holdersRevenueUSD: protocolSplit.voterFeesUSD,
    protocolRevenueUSD: protocolSplit.treasuryFeesUSD,
    supplySideRevenueUSD: feeEvents.reduce((sum, event) => sum + Number(event.lpFeesUSD ?? 0), 0),
  };
}

async function fetchDlmmDayStats(options: FetchOptions) {
  return fetchDlmmDayStatsForDay(options, options.startOfDay);
}

async function fetchDlmmDayStatsForDay(options: FetchOptions, startOfDay: number): Promise<IDlmmStats> {
  const query = gql`
    query getDLMMProtocolDayData($startOfDay: Int!) {
      DLMMProtocolDayData(
        where: { chainId: { _eq: ${avaxChainId} }, startOfDay: { _eq: $startOfDay } }
      ) {
        volumeUSD
        feesUSD
        voterFeesUSD
        treasuryFeesUSD
      }
    }
  `;
  const data = await request<any>(dlmmSubgraphEndpoints[options.chain], query, {
    startOfDay,
  });
  const dayData = data.DLMMProtocolDayData?.[0];
  const feesUSD = Number(dayData?.feesUSD ?? 0);
  const voterFeesUSD = Number(dayData?.voterFeesUSD ?? 0);
  const treasuryFeesUSD = Number(dayData?.treasuryFeesUSD ?? 0);

  return {
    volumeUSD: Number(dayData?.volumeUSD ?? 0),
    feesUSD,
    holdersRevenueUSD: voterFeesUSD,
    protocolRevenueUSD: treasuryFeesUSD,
    supplySideRevenueUSD: Math.max(feesUSD - voterFeesUSD - treasuryFeesUSD, 0),
  };
}

async function fetchDlmmDayStatsByStart(options: FetchOptions, startOfDays: number[]) {
  const query = gql`
    query getDLMMProtocolDayData($startOfDays: [Int!]!) {
      DLMMProtocolDayData(
        where: { chainId: { _eq: ${avaxChainId} }, startOfDay: { _in: $startOfDays } }
      ) {
        startOfDay
        volumeUSD
        feesUSD
        voterFeesUSD
        treasuryFeesUSD
      }
    }
  `;
  const data = await request<any>(dlmmSubgraphEndpoints[options.chain], query, {
    startOfDays,
  });

  return new Map<number, IDlmmStats>((data.DLMMProtocolDayData ?? []).map((dayData: any) => {
    const feesUSD = Number(dayData?.feesUSD ?? 0);
    const voterFeesUSD = Number(dayData?.voterFeesUSD ?? 0);
    const treasuryFeesUSD = Number(dayData?.treasuryFeesUSD ?? 0);

    return [Number(dayData.startOfDay), {
      volumeUSD: Number(dayData?.volumeUSD ?? 0),
      feesUSD,
      holdersRevenueUSD: voterFeesUSD,
      protocolRevenueUSD: treasuryFeesUSD,
      supplySideRevenueUSD: Math.max(feesUSD - voterFeesUSD - treasuryFeesUSD, 0),
    }];
  }));
}

async function fetchDlmmStats(options: FetchOptions): Promise<IDlmmGraphRes> {
  const voteBribes = await getDlmmBribes(options);
  const dlmmVoteBribes = voteBribes.filter((e) => e.dlmmPool);
  const tokenIds = new Set(dlmmVoteBribes.map((e) => e.token.id));
  tokenIds.add(PHAR_TOKEN_CONTRACT.toLowerCase());
  const tokens = await getTokens(options, Array.from(tokenIds));
  const dlmmUserBribeRevenueUSD = dlmmVoteBribes.reduce((acc, bribe) => {
    const token = tokens.find((t) => t.id === bribe.token.id);
    return acc + Number(bribe.amount) * Number(token?.priceUSD ?? 0);
  }, 0);
  const dlmmStats = shouldUseDayRollups(options)
    ? await fetchDlmmDayStats(options)
    : await fetchDlmmWindowStats(options);

  return {
    dlmmVolumeUSD: dlmmStats.volumeUSD,
    dlmmFeesUSD: dlmmStats.feesUSD,
    dlmmBribeRevenueUSD: dlmmUserBribeRevenueUSD,
    dlmmProtocolRevenueUSD: dlmmStats.protocolRevenueUSD,
    dlmmHoldersRevenueUSD: dlmmStats.holdersRevenueUSD,
    dlmmSupplySideRevenueUSD: dlmmStats.supplySideRevenueUSD,
  };
}

const fetch = async (options: FetchOptions) => {
  const stats = await fetchDlmmStats(options);
  const dailyFees = stats.dlmmFeesUSD;
  const dailyVolume = stats.dlmmVolumeUSD;
  const dailyProtocolRevenue = stats.dlmmProtocolRevenueUSD;
  const dailyHoldersRevenue = stats.dlmmHoldersRevenueUSD;
  const dailySupplySideRevenue = stats.dlmmSupplySideRevenueUSD;
  const dailyBribesRevenue = stats.dlmmBribeRevenueUSD;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue + dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyBribesRevenue,
  };
};

const methodology = {
  Fees: "Swap fees generated by Pharaoh DLMM pools.",
  Revenue: "Swap fee revenue directed to the protocol treasury and xPHAR voters.",
  UserFees: "Total swap fees paid by traders.",
  ProtocolRevenue: "Treasury share of swap fees.",
  HoldersRevenue: "Swap fees distributed to xPHAR voters.",
  SupplySideRevenue: "Swap fees retained by liquidity providers.",
  BribesRevenue: "Vote incentives distributed to xPHAR voters.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.AVAX],
  start: "2025-10-08",
  methodology,
};

export default adapter;
