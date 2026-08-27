import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";
import { METRIC } from "../helpers/metrics";

export const SARCOPHAGUS_FEE_RECLASSIFICATION_LABEL = "Sarcophagus fee reclassification";

type SarcophagusPoolType = "CL" | "LEGACY" | "DLMM";

const query = gql`
  query sarcophagusFunding(
    $chainId: Int!
    $poolType: String!
    $from: String!
    $to: String!
    $limit: Int!
    $offset: Int!
  ) {
    SarcophagusFunding(
      limit: $limit
      offset: $offset
      where: {
        chainId: { _eq: $chainId }
        poolType: { _eq: $poolType }
        timestamp: { _gte: $from, _lt: $to }
      }
      order_by: { id: asc }
    ) {
      amountUSD
    }
  }
`;

export async function fetchSarcophagusFundingUSD({
  endpoint,
  chainId,
  poolType,
  startTimestamp,
  endTimestamp,
}: {
  endpoint: string;
  chainId: number;
  poolType: SarcophagusPoolType;
  startTimestamp: number;
  endTimestamp: number;
}) {
  const rows = await paginate(async (limit, offset) => {
    const data = await request<{ SarcophagusFunding: { amountUSD: string }[] }>(endpoint, query, {
      chainId,
      poolType,
      // FetchOptions starts one second before the requested window.
      from: String(startTimestamp + 1),
      to: String(endTimestamp),
      limit,
      offset,
    });
    return data.SarcophagusFunding;
  }, subgraphQueryLimit);

  let total = 0;
  for (const row of rows) {
    if (!row.amountUSD.trim()) {
      throw new Error(`Invalid SarcophagusFunding amountUSD: ${row.amountUSD}`);
    }
    const amountUSD = Number(row.amountUSD);
    if (!Number.isFinite(amountUSD)) {
      throw new Error(`Invalid SarcophagusFunding amountUSD: ${row.amountUSD}`);
    }
    total += amountUSD;
  }
  return total;
}

// RAM token on HyperEVM: https://hyperevmscan.io/address/0x555570a286f15ebdfe42b66ede2f724aa1ab5555
const RAM_TOKEN_CONTRACT = "0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555";

const subgraphEndpoints: any = {
  [CHAIN.ROBINHOOD]: "https://gateway.kingdom.dev/robinhood/converter/graphql",
};

const dlmmSubgraphEndpoints: any = {
  [CHAIN.ROBINHOOD]: "https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql",
};

const chainIds: Record<string, number> = {
  // Robinhood Chain mainnet: https://docs.robinhood.com/chain/connecting/
  [CHAIN.ROBINHOOD]: 4663,
};

const subgraphQueryLimit = 1000;
// Allow one extra hour for completed daily rollups to materialize.
const historicalRollupAgeSeconds = 25 * 60 * 60;
const dayInSeconds = 24 * 60 * 60;

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

interface IDlmmPool {
  id: string;
  isAlive?: boolean;
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
        where: { timestamp_gte: $from, timestamp_lt: $to }
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

function splitDlmmProtocolFees(protocolFeesUSD: number, feeTreasury: number, isAlive: boolean) {
  if (protocolFeesUSD <= 0) return { voterFeesUSD: 0, treasuryFeesUSD: 0 };
  if (!isAlive) return { voterFeesUSD: 0, treasuryFeesUSD: protocolFeesUSD };

  const treasuryFeesUSD = protocolFeesUSD * feeTreasury;
  return {
    voterFeesUSD: protocolFeesUSD - treasuryFeesUSD,
    treasuryFeesUSD,
  };
}

async function fetchDlmmFactoryFeeTreasury(options: FetchOptions) {
  const chainId = chainIds[options.chain];
  const query = gql`
    query getDLMMFactoryFeeTreasury {
      DLMMFactory(where: { chainId: { _eq: ${chainId} } }) {
        feeTreasury
      }
    }
  `;
  const data = await request<any>(dlmmSubgraphEndpoints[options.chain], query);
  const feeTreasury = Number(data.DLMMFactory?.[0]?.feeTreasury ?? 0);

  if (!Number.isFinite(feeTreasury) || feeTreasury < 0 || feeTreasury > 1) {
    throw new Error("Invalid DLMM factory feeTreasury");
  }

  return feeTreasury;
}

async function fetchDlmmPoolIsAliveById(options: FetchOptions, poolIds: string[]) {
  if (!poolIds.length) return new Map<string, boolean>();

  const chainId = chainIds[options.chain];
  const query = gql`
    query getDLMMPools($poolIds: [String!]!) {
      DLMMPool(where: { chainId: { _eq: ${chainId} }, id: { _in: $poolIds } }) {
        id
        isAlive
      }
    }
  `;
  const data = await request<any>(dlmmSubgraphEndpoints[options.chain], query, { poolIds });

  return new Map((data.DLMMPool ?? []).map((pool: IDlmmPool) => [pool.id, pool.isAlive === true]));
}

async function fetchDlmmWindowStats(options: FetchOptions) {
  const endpoint = dlmmSubgraphEndpoints[options.chain];
  const chainId = chainIds[options.chain];
  const swapsQuery = gql`
    query dlmmSwaps($from: String!, $to: String!, $limit: Int!, $offset: Int!) {
      DLMMSwap(
        limit: $limit
        offset: $offset
        where: { chainId: { _eq: ${chainId} }, timestamp: { _gte: $from, _lt: $to } }
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
        where: { chainId: { _eq: ${chainId} }, timestamp: { _gte: $from, _lt: $to } }
      ) {
        totalFeesUSD
        protocolFeesUSD
        lpFeesUSD
        pool
      }
    }
  `;

  const variables = {
    from: String(options.startTimestamp + 1),
    to: String(options.endTimestamp),
  };
  const [swaps, feeEvents] = await Promise.all([
    paginate<{ amountUSD?: string }>(
      (limit, offset) => request<any>(endpoint, swapsQuery, { ...variables, limit, offset })
        .then((data) => data.DLMMSwap),
      subgraphQueryLimit,
    ),
    paginate<{
      totalFeesUSD?: string;
      protocolFeesUSD?: string;
      lpFeesUSD?: string;
      pool?: string;
    }>(
      (limit, offset) => request<any>(endpoint, feesQuery, { ...variables, limit, offset })
        .then((data) => data.DLMMFeeEvent),
      subgraphQueryLimit,
    ),
  ]);
  const poolIds = Array.from(new Set(feeEvents.map((event) => event.pool ?? "").filter(Boolean)));
  const [feeTreasury, poolIsAliveById] = await Promise.all([
    fetchDlmmFactoryFeeTreasury(options),
    fetchDlmmPoolIsAliveById(options, poolIds),
  ]);

  const protocolSplit = feeEvents.reduce((sum, event) => {
    const split = splitDlmmProtocolFees(
      Number(event.protocolFeesUSD ?? 0),
      feeTreasury,
      poolIsAliveById.get(event.pool ?? "") === true,
    );

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
  const chainId = chainIds[options.chain];
  const query = gql`
    query getDLMMProtocolDayData($startOfDay: Int!) {
      DLMMProtocolDayData(
        where: { chainId: { _eq: ${chainId} }, startOfDay: { _eq: $startOfDay } }
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

async function fetchDlmmStats(options: FetchOptions): Promise<IDlmmGraphRes> {
  const voteBribes = await getDlmmBribes(options);
  const dlmmVoteBribes = voteBribes.filter((e) => e.dlmmPool);
  const tokenIds = new Set(dlmmVoteBribes.map((e) => e.token.id));
  tokenIds.add(RAM_TOKEN_CONTRACT.toLowerCase());
  const tokens = await getTokens(options, Array.from(tokenIds));
  const tokenPriceById = new Map(tokens.map((token) => [token.id, Number(token.priceUSD)]));
  const dlmmUserBribeRevenueUSD = dlmmVoteBribes.reduce((total, bribe) => {
    const priceUSD = tokenPriceById.get(bribe.token.id);
    if (priceUSD === undefined || !Number.isFinite(priceUSD) || priceUSD < 0) {
      throw new Error(
        `Missing or invalid token price for ${bribe.token.id} on ${options.chain} at ${options.startOfDay}`,
      );
    }
    return total + Number(bribe.amount) * priceUSD;
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
  const [stats, sarcophagusFundingUSD] = await Promise.all([
    fetchDlmmStats(options),
    fetchSarcophagusFundingUSD({
      endpoint: dlmmSubgraphEndpoints[options.chain],
      chainId: chainIds[options.chain],
      poolType: "DLMM",
      startTimestamp: options.startTimestamp,
      endTimestamp: options.endTimestamp,
    }),
  ]);
  const dailyVolume = stats.dlmmVolumeUSD;
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(stats.dlmmFeesUSD, METRIC.SWAP_FEES);
  dailyFees.addUSDValue(stats.dlmmBribeRevenueUSD, 'Bribes');

  dailyUserFees.addUSDValue(stats.dlmmFeesUSD, METRIC.SWAP_FEES);

  dailyRevenue.addUSDValue(stats.dlmmHoldersRevenueUSD, 'Swap Fees to holders');
  dailyRevenue.addUSDValue(stats.dlmmBribeRevenueUSD, 'Bribes to holders');
  dailyRevenue.addUSDValue(stats.dlmmProtocolRevenueUSD, 'Swap Fees to protocol');
  dailyHoldersRevenue.addUSDValue(stats.dlmmHoldersRevenueUSD, 'Swap Fees to holders');
  dailyHoldersRevenue.addUSDValue(stats.dlmmBribeRevenueUSD, 'Bribes to holders');
  dailyProtocolRevenue.addUSDValue(stats.dlmmProtocolRevenueUSD, 'Swap Fees to protocol');
  dailyProtocolRevenue.addUSDValue(-sarcophagusFundingUSD, SARCOPHAGUS_FEE_RECLASSIFICATION_LABEL);
  dailyHoldersRevenue.addUSDValue(sarcophagusFundingUSD, SARCOPHAGUS_FEE_RECLASSIFICATION_LABEL);

  dailySupplySideRevenue.addUSDValue(stats.dlmmSupplySideRevenueUSD, 'Swap Fees to LPs');

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
  Fees: "Includes swap fees and bribes paid by protocols",
  Revenue: "Revenue going to the protocol + Token holder Revenue.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Swap fees going to the protocol",
  HoldersRevenue: "Swap fees distributed to holders and all the bribes go to holders",
  SupplySideRevenue: "Swap fees distributed to LPs (from gauged pools).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees are collected from users on each swap.",
    ["Bribes"]: "Bribes paid by protocols",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Fees paid by users on each swap.",
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
  // DLMM voter vs treasury split for recent windows is derived from fee events;
  // daily protocol rollups remain the source for historical full-day queries.
  pullHourly: false,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-22",
  methodology,
  breakdownMethodology,
};

export default adapter;
