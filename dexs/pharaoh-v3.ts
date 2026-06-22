import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";
import { PHARAOH_METRIC } from "./pharaoh-v2";

const PHAR_TOKEN_CONTRACT = "0x13A466998Ce03Db73aBc2d4DF3bBD845Ed1f28E7";

export const subgraphEndpoints: any = {
  [CHAIN.AVAX]: "https://avalanchev2.kingdomsubgraph.com/subgraphs/name/pharaoh-v3-pruned/",
};

const rawSubgraphEndpoints: any = {
  [CHAIN.AVAX]: "https://gateway.kingdom.dev/avalanche/subgraph/v1/graphql",
};

const subgraphQueryLimit = 1000;

const historicalRollupAgeSeconds = 25 * 60 * 60;
const dayInSeconds = 24 * 60 * 60;
const avaxChainId = 43114;

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

interface IPoolMetadata {
  id: string;
  feeProtocol?: string;
}

interface IGaugeMetadata {
  pool: string;
  isAlive?: boolean;
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
        where: { timestamp_gt: $from, timestamp_lt: $to }
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
  const startsAtDayBoundary = options.startTimestamp === options.startOfDay
    || options.startTimestamp === options.startOfDay - 1;
  const isFullDayWindow = startsAtDayBoundary
    && options.endTimestamp === options.startOfDay + dayInSeconds;

  return isFullDayWindow && Math.floor(Date.now() / 1000) - options.endTimestamp > historicalRollupAgeSeconds;
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
  root: "ClPoolHourData" | "LegacyPoolHourData",
  poolRoot: "ClPool" | "LegacyPool",
): Promise<IPoolHourStats> {
  const query = gql`
    query poolHourStats($from: Int!, $to: Int!, $first: Int!, $skip: Int!) {
      items: ${root}(
        limit: $first
        offset: $skip
        where: { chainId: { _eq: ${avaxChainId} }, startOfHour: { _gt: $from, _lt: $to } }
      ) {
        pool
        volumeUSD
        feesUSD
        treasuryFeesUSD
      }
    }
  `;

  const items = await paginate<{
    pool?: string;
    volumeUSD?: string;
    feesUSD?: string;
    treasuryFeesUSD?: string;
  }>(
    (first, skip) => request<any>(rawSubgraphEndpoints[options.chain], query, {
      from: options.startTimestamp,
      to: options.endTimestamp,
      first,
      skip,
    }).then((data) => data.items),
    subgraphQueryLimit,
  );
  const poolIds = Array.from(new Set(items.map((item) => item.pool ?? "").filter(Boolean)));
  const metadataQuery = gql`
    query poolMetadata($poolIds: [String!]!) {
      pools: ${poolRoot}(where: { chainId: { _eq: ${avaxChainId} }, id: { _in: $poolIds } }) {
        id
        feeProtocol
      }
      gauges: Gauge(where: { chainId: { _eq: ${avaxChainId} }, pool: { _in: $poolIds } }) {
        pool
        isAlive
      }
    }
  `;
  const metadata = poolIds.length
    ? await request<any>(rawSubgraphEndpoints[options.chain], metadataQuery, { poolIds })
    : { pools: [], gauges: [] };
  const poolById = new Map<string, IPoolMetadata>((metadata.pools ?? []).map((pool: IPoolMetadata) => [pool.id, pool]));
  const gaugeIsAliveByPool = new Map<string, boolean>((metadata.gauges ?? []).map((gauge: IGaugeMetadata) => [gauge.pool, gauge.isAlive === true]));
  const protocolSplit = items.reduce((sum, item) => {
    const feesUSD = Number(item.feesUSD ?? 0);
    const treasuryFeesUSD = Number(item.treasuryFeesUSD ?? 0);
    const feeProtocol = Number(poolById.get(item.pool ?? "")?.feeProtocol ?? 0);
    const protocolFeesUSD = feesUSD * feeProtocol;
    const voterFeesUSD = gaugeIsAliveByPool.get(item.pool ?? "") === true
      ? Math.max(protocolFeesUSD - treasuryFeesUSD, 0)
      : 0;

    return {
      voterFeesUSD: sum.voterFeesUSD + voterFeesUSD,
      treasuryFeesUSD: sum.treasuryFeesUSD + treasuryFeesUSD,
    };
  }, { voterFeesUSD: 0, treasuryFeesUSD: 0 });

  return {
    volumeUSD: items.reduce((sum, item) => sum + Number(item.volumeUSD ?? 0), 0),
    feesUSD: items.reduce((sum, item) => sum + Number(item.feesUSD ?? 0), 0),
    voterFeesUSD: protocolSplit.voterFeesUSD,
    treasuryFeesUSD: protocolSplit.treasuryFeesUSD,
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
      : fetchPoolHourStats(options, "ClPoolHourData", "ClPool"),
    useDayRollups
      ? Promise.resolve({
        volumeUSD: Number(legacyDayData?.volumeUsd ?? 0),
        feesUSD: legacyDayFeesUSD,
        voterFeesUSD: legacyDayVoterFeesUSD,
        treasuryFeesUSD: legacyDayTreasuryFeesUSD,
      })
      : fetchPoolHourStats(options, "LegacyPoolHourData", "LegacyPool"),
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
  const dailyVolume = stats.clVolumeUSD;
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const clSupplySideRevenue =
    stats.clFeesUSD - stats.clUserFeesRevenueUSD - stats.clProtocolRevenueUSD;

  dailyFees.addUSDValue(stats.clFeesUSD, PHARAOH_METRIC.SwapFees);
  dailyFees.addUSDValue(stats.clBribeRevenueUSD, PHARAOH_METRIC.VoteIncentives);

  dailyUserFees.addUSDValue(stats.clFeesUSD, PHARAOH_METRIC.SwapFees);
  
  dailyRevenue.addUSDValue(stats.clUserFeesRevenueUSD, PHARAOH_METRIC.SwapFeesToVoters);
  dailyRevenue.addUSDValue(stats.clBribeRevenueUSD, PHARAOH_METRIC.VoteIncentives);
  dailyHoldersRevenue.addUSDValue(stats.clUserFeesRevenueUSD, PHARAOH_METRIC.SwapFeesToVoters);
  dailyHoldersRevenue.addUSDValue(stats.clBribeRevenueUSD, PHARAOH_METRIC.VoteIncentives);

  dailyRevenue.addUSDValue(stats.clProtocolRevenueUSD, PHARAOH_METRIC.SwapFeesToTreasury);
  dailyProtocolRevenue.addUSDValue(stats.clProtocolRevenueUSD, PHARAOH_METRIC.SwapFeesToTreasury);
  
  dailySupplySideRevenue.addUSDValue(clSupplySideRevenue, PHARAOH_METRIC.SwapFeesToLPs);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Swap fees generated by Pharaoh concentrated liquidity pools.",
  Revenue: "Swap fee revenue directed to the protocol treasury and xPHAR voters.",
  UserFees: "Swap fees paid by traders.",
  ProtocolRevenue: "Treasury share of swap fees.",
  HoldersRevenue: "Swap fees and vote incentives distributed to xPHAR voters.",
  SupplySideRevenue: "Swap fees retained by liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [PHARAOH_METRIC.SwapFees]: "Swap fees paid by traders.",
    [PHARAOH_METRIC.VoteIncentives]: "Vote incentives distributed to xPHAR voters.",
  },
  Revenue: {
    [PHARAOH_METRIC.SwapFeesToTreasury]: "Swap fees shared to treasury.",
    [PHARAOH_METRIC.SwapFeesToVoters]: "Swap fees shared to xPHAR voters.",
    [PHARAOH_METRIC.VoteIncentives]: "Vote incentives distributed to xPHAR voters.",
  },
  UserFees: {
    [PHARAOH_METRIC.SwapFees]: "Swap fees paid by traders.",
  },
  ProtocolRevenue: {
    [PHARAOH_METRIC.SwapFeesToTreasury]: "Swap fees shared to treasury.",
  },
  HoldersRevenue: {
    [PHARAOH_METRIC.SwapFeesToVoters]: "Swap fees shared to xPHAR voters.",
    [PHARAOH_METRIC.VoteIncentives]: "Vote incentives distributed to xPHAR voters.",
  },
  SupplySideRevenue: {
    [PHARAOH_METRIC.SwapFeesToLPs]: "Swap fees distributed to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.AVAX],
  start: '2025-10-08',
  methodology,
  breakdownMethodology,
};

export default adapter;
