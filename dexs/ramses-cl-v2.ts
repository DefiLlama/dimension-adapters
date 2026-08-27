import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";
import { METRIC } from "../helpers/metrics";
import {
  fetchSarcophagusFundingUSD,
  SARCOPHAGUS_FEE_RECLASSIFICATION_LABEL,
} from "./ramses-dlmm";

// RAM token on HyperEVM: https://hyperevmscan.io/address/0x555570a286f15ebdfe42b66ede2f724aa1ab5555
const RAM_TOKEN_CONTRACT = "0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555";

export const subgraphEndpoints: any = {
  [CHAIN.ARBITRUM]: "https://arbitrumv2.kingdomsubgraph.com/subgraphs/name/ramses-pruned",
  [CHAIN.HYPERLIQUID]: "https://hyperevm.kingdomsubgraph.com/subgraphs/name/ramses-v3-pruned/",
  [CHAIN.POLYGON]: "https://polygon.kingdomsubgraph.com/subgraphs/name/ramses-pruned",
  [CHAIN.ROBINHOOD]: "https://gateway.kingdom.dev/robinhood/converter/graphql",
};

const rawSubgraphEndpoints: any = {
  [CHAIN.ARBITRUM]: "https://gateway.kingdom.dev/arbitrum/subgraph/v1/graphql",
  [CHAIN.HYPERLIQUID]: "https://gateway.kingdom.dev/hyperevm/subgraph/v1/graphql",
  [CHAIN.POLYGON]: "https://gateway.kingdom.dev/polygon/subgraph/v1/graphql",
  [CHAIN.ROBINHOOD]: "https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql",
};

const chainIds: Record<string, number> = {
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.HYPERLIQUID]: 999,
  [CHAIN.POLYGON]: 137,
  // Robinhood Chain mainnet: https://docs.robinhood.com/chain/connecting/
  [CHAIN.ROBINHOOD]: 4663,
};

const subgraphQueryLimit = 1000;
// Allow one extra hour for completed daily rollups to materialize.
const historicalRollupAgeSeconds = 25 * 60 * 60;
const dayInSeconds = 24 * 60 * 60;

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
        where: { timestamp_gte: $from, timestamp_lt: $to }
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
      from: options.startTimestamp + 1,
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
  return Math.floor(timestamp / dayInSeconds) * dayInSeconds;
}

function getWindowStartOfDays(options: FetchOptions) {
  const days = new Set<number>();
  const firstDay = getStartOfDay(options.startTimestamp);
  const lastDay = getStartOfDay(options.endTimestamp - 1);

  for (let day = firstDay; day <= lastDay; day += dayInSeconds) {
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
  const chainId = chainIds[options.chain];
  const query = gql`
    query poolHourStats($from: Int!, $to: Int!, $first: Int!, $skip: Int!) {
      items: ${root}(
        limit: $first
        offset: $skip
        where: { chainId: { _eq: ${chainId} }, startOfHour: { _gte: $from, _lt: $to } }
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
      from: options.startTimestamp + 1,
      to: options.endTimestamp,
      first,
      skip,
    }).then((data) => data.items),
    subgraphQueryLimit,
  );
  const poolIds = Array.from(new Set(items.map((item) => item.pool ?? "").filter(Boolean)));
  const metadataQuery = gql`
    query poolMetadata($poolIds: [String!]!) {
      pools: ${poolRoot}(where: { chainId: { _eq: ${chainId} }, id: { _in: $poolIds } }) {
        id
        feeProtocol
      }
      gauges: Gauge(where: { chainId: { _eq: ${chainId} }, pool: { _in: $poolIds } }) {
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
  tokenIds.add(RAM_TOKEN_CONTRACT.toLowerCase());
  const tokens = await getTokens(options, Array.from(tokenIds));
  const legacyVoteBribes = voteBribes.filter((e) => e.legacyPool);
  const clVoteBribes = voteBribes.filter((e) => e.clPool);
  const tokenPriceById = new Map(tokens.map((token) => [token.id, Number(token.priceUSD)]));
  const getBribeRevenueUSD = (bribes: IVoteBribe[]) => bribes.reduce((total, bribe) => {
    const priceUSD = tokenPriceById.get(bribe.token.id);
    if (priceUSD === undefined || !Number.isFinite(priceUSD) || priceUSD < 0) {
      throw new Error(
        `Missing or invalid token price for ${bribe.token.id} on ${options.chain} at ${options.startOfDay}`,
      );
    }
    return total + Number(bribe.amount) * priceUSD;
  }, 0);

  const legacyUserBribeRevenueUSD = getBribeRevenueUSD(legacyVoteBribes);
  const clUserBribeRevenueUSD = getBribeRevenueUSD(clVoteBribes);

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

export function createFetchHandler(poolType: PoolType) {
  return async (options: FetchOptions) => {
    const [stats, sarcophagusFundingUSD] = await Promise.all([
      fetchStats(options),
      fetchSarcophagusFundingUSD({
        endpoint: rawSubgraphEndpoints[options.chain],
        chainId: chainIds[options.chain],
        poolType: poolType === 'cl' ? 'CL' : 'LEGACY',
        startTimestamp: options.startTimestamp,
        endTimestamp: options.endTimestamp,
      }),
    ]);
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
    dailyProtocolRevenue.addUSDValue(-sarcophagusFundingUSD, SARCOPHAGUS_FEE_RECLASSIFICATION_LABEL);
    dailyHoldersRevenue.addUSDValue(sarcophagusFundingUSD, SARCOPHAGUS_FEE_RECLASSIFICATION_LABEL);

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
    [SARCOPHAGUS_FEE_RECLASSIFICATION_LABEL]: "Subtracts delayed Sarcophagus funding already accrued as protocol revenue.",
  },
  SupplySideRevenue: {
    ["Swap Fees to LPs"]: "Fees distributed to LPs (from gauged pools).",
  },
  HoldersRevenue: {
    ["Swap Fees to holders"]: "User fees are distributed among holders.",
    ["Bribes to holders"]: "Bribes paid by protocols to holders",
    [SARCOPHAGUS_FEE_RECLASSIFICATION_LABEL]: "Reclassifies fees already accrued as protocol revenue into holder revenue when funded to Sarcophagus.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // Delayed Sarcophagus funding can exceed protocol revenue accrued in the current window.
  allowNegativeValue: true,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  fetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: { start: '2025-11-08' },
    [CHAIN.ARBITRUM]: { start: '2026-01-13' },
    [CHAIN.POLYGON]: { start: '2026-01-28' },
    [CHAIN.ROBINHOOD]: { start: '2026-07-22' },
  },
};

export default adapter;
