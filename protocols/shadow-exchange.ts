import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";

type TStartTime = {
  [key: string]: number;
};

const SHADOW_TOKEN_CONTRACT = "0x3333b97138d4b086720b5ae8a7844b1345a33333";
const XSHADOW_TOKEN_CONTRACT = "0x5050bc082FF4A74Fb6B0B04385dEfdDB114b2424";

const startTimeV2: TStartTime = {
  [CHAIN.SONIC]: 1735129946,
};

export const v2Endpoints: any = {
  [CHAIN.SONIC]: "https://sonicv2.kingdomsubgraph.com/subgraphs/name/core-full",
};

const secondsInADay = 24 * 60 * 60;
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
  dailyXshadowInstantExitFeeUSD: number;
}

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

interface IPoolDayData {
  pool: { gauge: { id: string }; gaugeV2: { id: string } };
  feesUSD: string;
}

interface IGauge {
  id: string;
  isAlive: boolean;
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
    request<any>(v2Endpoints[options.chain], query, {
      from: options.startOfDay,
      to: options.startOfDay + secondsInADay,
      first,
      skip,
    }).then((data) => data.voteBribes);

  return paginate<IVoteBribe>(getData, subgraphQueryLimit);
}

async function getClPoolDayDatas(options: FetchOptions) {
  const query = gql`
    query poolDayData($first: Int!, $skip: Int!) {
      clPoolDayDatas(first: $first, skip: $skip, where: { startOfDay: ${options.startOfDay}, feesUSD_gt: 0 }) {
        pool { gauge { id } gaugeV2 { id }}
        feesUSD
      }
    }
  `;

  const getData = async (first: number, skip: number) =>
    request<any>(v2Endpoints[options.chain], query, {
      first,
      skip,
    }).then((data) => data.clPoolDayDatas);

  return paginate<IPoolDayData>(getData, subgraphQueryLimit);
}

async function getLegacyPoolDayDatas(options: FetchOptions) {
  const query = gql`
    query poolDayData($first: Int!, $skip: Int!) {
      legacyPoolDayDatas(first: $first, skip: $skip, where: { startOfDay: ${options.startOfDay}, feesUSD_gt: 0 }) {
        pool { gauge { id } gaugeV2 { id }}
        feesUSD
      }
    }
  `;

  const getData = async (first: number, skip: number) =>
    request<any>(v2Endpoints[options.chain], query, {
      first,
      skip,
    }).then((data) => data.legacyPoolDayDatas);

  return paginate<IPoolDayData>(getData, subgraphQueryLimit);
}

async function getAliveGauges(options: FetchOptions) {
  const startBlock = await options.getStartBlock();
  const query = gql`
    query gauges($first: Int!, $skip: Int!) {
      gauges(block: { number: ${startBlock} }, first: $first, skip: $skip, where: { isAlive: true }) {
        id
      }
    }
  `;

  const getData = async (first: number, skip: number) =>
    request<any>(v2Endpoints[options.chain], query, {
      first,
      skip,
    }).then((data) => data.gauges);

  return paginate<IGauge>(getData, subgraphQueryLimit);
}

async function getTokens(options: FetchOptions, tokens: string[]) {
  const startBlock = await options.getStartBlock();
  const tokenIds = tokens.map((e) => `"${e}"`).join(",");
  const query = gql`
    query tokens($first: Int!, $skip: Int!) {
      tokens(block: { number: ${startBlock} }, first: $first, skip: $skip, where: { priceUSD_gt: 0, id_in: [${tokenIds}]}) {
        id
        priceUSD
      }
    }
  `;

  const getData = async (first: number, skip: number) =>
    request<any>(v2Endpoints[options.chain], query, {
      first,
      skip,
    }).then((data) => data.tokens);

  return paginate<IToken>(getData, subgraphQueryLimit);
}

export async function fetchStats(options: FetchOptions): Promise<IGraphRes> {
  const statsQuery = `
    {
      clProtocolDayDatas(where:{startOfDay: ${options.startOfDay}}) {
        startOfDay
        volumeUSD
        feesUSD
      }
      legacyProtocolDayDatas(where:{startOfDay: ${options.startOfDay}}) {
        startOfDay
        volumeUSD
        feesUSD
      }
    }
  `;

  const voteBribes = await getBribes(options);
  const tokenIds = new Set(voteBribes.map((e) => e.token.id));
  tokenIds.add(SHADOW_TOKEN_CONTRACT.toLowerCase());

  const tokens = await getTokens(options, Array.from(tokenIds));
  const { clProtocolDayDatas, legacyProtocolDayDatas } = await request(
    v2Endpoints[options.chain],
    statsQuery,
  );

  const clPoolDayDatas = await getClPoolDayDatas(options);
  const legacyPoolDayDatas = await getLegacyPoolDayDatas(options);
  const aliveGauges = (await getAliveGauges(options)).map((e) => e.id);
  const legacyVoteBribes = voteBribes.filter((e) => e.legacyPool);
  const clVoteBribes = voteBribes.filter((e) => e.clPool);

  const legacyGaugelessPools = legacyPoolDayDatas.filter(
    (day) =>
      !aliveGauges.includes(day.pool.gauge?.id) &&
      !aliveGauges.includes(day.pool.gaugeV2?.id),
  );
  const clGaugelessPools = clPoolDayDatas.filter(
    (day) =>
      !aliveGauges.includes(day.pool.gauge?.id) &&
      !aliveGauges.includes(day.pool.gaugeV2?.id),
  );
  const clGaugedPools = clPoolDayDatas.filter(
    (day) =>
      aliveGauges.includes(day.pool.gauge?.id) ||
      aliveGauges.includes(day.pool.gaugeV2?.id),
  );
  const legacyGaugedPools = legacyPoolDayDatas.filter(
    (day) =>
      aliveGauges.includes(day.pool.gauge?.id) ||
      aliveGauges.includes(day.pool.gaugeV2?.id),
  );

  // 5% of non-gauge fees goes to protocol
  const clProtocolRevenueUSD = clGaugelessPools.reduce((acc, pool) => {
    return acc + Number(pool.feesUSD) * 0.05;
  }, 0);
  const legacyProtocolRevenueUSD = legacyGaugelessPools.reduce((acc, pool) => {
    return acc + Number(pool.feesUSD) * 0.05;
  }, 0);

  // 100% of gauged pool fees goes to holders
  const clUserFeesRevenueUSD = clGaugedPools.reduce((acc, pool) => {
    return acc + Number(pool.feesUSD);
  }, 0);
  const legacyUserFeesRevenueUSD = legacyGaugedPools.reduce((acc, pool) => {
    return acc + Number(pool.feesUSD);
  }, 0);

  const clUserBribeRevenueUSD = clVoteBribes.reduce((acc, bribe) => {
    const token = tokens.find((t) => t.id === bribe.token.id);
    return acc + Number(bribe.amount) * Number(token?.priceUSD ?? 0);
  }, 0);
  const legacyUserBribeRevenueUSD = legacyVoteBribes.reduce((acc, bribe) => {
    const token = tokens.find((t) => t.id === bribe.token.id);
    return acc + Number(bribe.amount) * Number(token?.priceUSD ?? 0);
  }, 0);

  const InstantExitLogs = await options.getLogs({
    target: XSHADOW_TOKEN_CONTRACT,
    eventAbi: 'event InstantExit(address indexed user, uint256 amount)',
    topic: '0xa8a63b0531e55ae709827fb089d01034e24a200ad14dc710dfa9e962005f629a'
  })
  let xshadowPenaltyAmount = 0;
  // console.log(InstantExitLogs);
  for (const log of InstantExitLogs) {
    xshadowPenaltyAmount += (Number(log.amount) / 1e18);
  }

  // Calculate xSHADOW rebase revenue in USD
  const shadowToken = tokens.find(t => t.id === SHADOW_TOKEN_CONTRACT);
  const shadowPriceUSD = Number(shadowToken?.priceUSD ?? 0);
  const dailyXshadowInstantExitFeeUSD = xshadowPenaltyAmount * shadowPriceUSD / 2; // XSHADOW is always 50% of the current shadow price.

  return {
    clVolumeUSD: Number(clProtocolDayDatas?.[0]?.volumeUSD ?? 0),
    clFeesUSD: Number(clProtocolDayDatas?.[0]?.feesUSD ?? 0),
    legacyVolumeUSD: Number(legacyProtocolDayDatas?.[0]?.volumeUSD ?? 0),
    legacyFeesUSD: Number(legacyProtocolDayDatas?.[0]?.feesUSD ?? 0),
    clBribeRevenueUSD: clUserBribeRevenueUSD,
    legacyBribeRevenueUSD: legacyUserBribeRevenueUSD,
    clUserFeesRevenueUSD: clUserFeesRevenueUSD,
    legacyUserFeesRevenueUSD: legacyUserFeesRevenueUSD,
    clProtocolRevenueUSD,
    legacyProtocolRevenueUSD,
    dailyXshadowInstantExitFeeUSD,
  };
}

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const stats = await fetchStats(options);
  const dailyFees = stats.clFeesUSD + stats.dailyXshadowInstantExitFeeUSD;
  const dailyVolume = stats.clVolumeUSD;
  const dailyHoldersRevenue = stats.clUserFeesRevenueUSD;
  const dailyProtocolRevenue = stats.clProtocolRevenueUSD;
  const dailyBribesRevenue = stats.clBribeRevenueUSD;
  const dailyTokenTaxes = stats.dailyXshadowInstantExitFeeUSD;

  const clSupplySideRevenue = stats.clFeesUSD - dailyHoldersRevenue - dailyProtocolRevenue;
  const dailySupplySideRevenue = clSupplySideRevenue;
  const dailyRevenue = dailyProtocolRevenue + dailyHoldersRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyBribesRevenue,
    dailyTokenTaxes,
  };
};

const methodology = {
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  BribesRevenue: "Bribes are distributed among holders.",
  SupplySideRevenue: "Fees distributed to LPs (from gauged pools).",
  TokenTax: "xSHADOW stakers instant exit penalty",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: startTimeV2[CHAIN.SONIC],
      meta: {
        methodology: methodology,
      },
    },
  },
};

export default adapter;
