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

function recordedDlmmValue(row: Record<string, unknown>, field: string) {
  const value = row[field];
  if ((typeof value !== 'string' && typeof value !== 'number')
    || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new Error(`Invalid recorded DLMM ${field}: ${value}`);
  }
  return Number(value);
}

function recordedDlmmSupplySideRevenue(feesUSD: number, voterFeesUSD: number, treasuryFeesUSD: number) {
  const remainder = feesUSD - voterFeesUSD - treasuryFeesUSD;
  // Allow only floating-point subtraction roundoff, scaled to the recorded USD amounts.
  const roundoff = 4 * Number.EPSILON * Math.max(feesUSD, voterFeesUSD, treasuryFeesUSD);
  if (remainder < -roundoff) {
    throw new Error(`Recorded DLMM fee splits exceed feesUSD: ${feesUSD} < ${voterFeesUSD} + ${treasuryFeesUSD}`);
  }
  return Math.max(remainder, 0);
}

async function fetchDlmmWindowStats(options: FetchOptions) {
  const from = options.startTimestamp + 1;
  const to = options.endTimestamp;
  if (from % 3600 !== 0 || to % 3600 !== 0 || to <= from) {
    throw new Error('DLMM recorded fee splits require an hour-aligned window');
  }
  const endpoint = dlmmSubgraphEndpoints[options.chain];
  const chainId = chainIds[options.chain];
  // The Ramses subgraph records swap and composition fees in these buckets.
  // DLMMFeeEvent has no voter/treasury split; current factory/gauge state cannot reproduce it.
  const query = gql`
    query dlmmHourStats($from: Int!, $to: Int!, $limit: Int!, $offset: Int!) {
      DLMMPoolHourData(
        limit: $limit
        offset: $offset
        order_by: { id: asc }
        where: { chainId: { _eq: ${chainId} }, startOfHour: { _gte: $from, _lt: $to } }
      ) {
        volumeUSD
        feesUSD
        voterFeesUSD
        treasuryFeesUSD
      }
    }
  `;
  const rows = await paginate<Record<string, unknown>>(
    (limit, offset) => request<any>(endpoint, query, { from, to, limit, offset })
      .then((data) => data.DLMMPoolHourData),
    subgraphQueryLimit,
  );
  return rows.reduce<IDlmmStats>((sum, row) => {
    const feesUSD = recordedDlmmValue(row, 'feesUSD');
    const voterFeesUSD = recordedDlmmValue(row, 'voterFeesUSD');
    const treasuryFeesUSD = recordedDlmmValue(row, 'treasuryFeesUSD');
    sum.volumeUSD += recordedDlmmValue(row, 'volumeUSD');
    sum.feesUSD += feesUSD;
    sum.holdersRevenueUSD += voterFeesUSD;
    sum.protocolRevenueUSD += treasuryFeesUSD;
    sum.supplySideRevenueUSD += recordedDlmmSupplySideRevenue(feesUSD, voterFeesUSD, treasuryFeesUSD);
    return sum;
  }, { volumeUSD: 0, feesUSD: 0, holdersRevenueUSD: 0, protocolRevenueUSD: 0, supplySideRevenueUSD: 0 });
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
  const feesUSD = dayData ? recordedDlmmValue(dayData, 'feesUSD') : 0;
  const voterFeesUSD = dayData ? recordedDlmmValue(dayData, 'voterFeesUSD') : 0;
  const treasuryFeesUSD = dayData ? recordedDlmmValue(dayData, 'treasuryFeesUSD') : 0;

  return {
    volumeUSD: dayData ? recordedDlmmValue(dayData, 'volumeUSD') : 0,
    feesUSD,
    holdersRevenueUSD: voterFeesUSD,
    protocolRevenueUSD: treasuryFeesUSD,
    supplySideRevenueUSD: recordedDlmmSupplySideRevenue(feesUSD, voterFeesUSD, treasuryFeesUSD),
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
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-22",
  methodology,
  breakdownMethodology,
};

export default adapter;
