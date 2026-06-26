import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";

const REX_TOKEN_CONTRACT = "0xEfD81eeC32B9A8222D1842ec3d99c7532C31e348";
const XREX_TOKEN_CONTRACT = "0xc93B315971A4f260875103F5DA84cB1E30f366Cc";

export const subgraphEndpoints: any = {
  [CHAIN.LINEA]: "https://linea.kingdomsubgraph.com/subgraphs/name/etherex",
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
  dailyXrexInstantExitFeeUSD: number;
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

  const voteBribes = await getBribes(options);
  const tokenIds = new Set(voteBribes.map((e) => e.token.id));
  tokenIds.add(REX_TOKEN_CONTRACT.toLowerCase());

  const tokens = await getTokens(options, Array.from(tokenIds));
  const {
    ClProtocolDayData: clProtocolDayData,
    LegacyProtocolDayData: legacyProtocolDayData,
  } = await request(subgraphEndpoints[options.chain], statsQuery, {
    startOfDay: options.startOfDay,
  });

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

  const InstantExitLogs = await options.getLogs({
    target: XREX_TOKEN_CONTRACT,
    eventAbi: "event InstantExit(address indexed user, uint256 amount)",
    topic: "0xa8a63b0531e55ae709827fb089d01034e24a200ad14dc710dfa9e962005f629a",
  });
  let rexPenaltyAmount = 0;

  for (const log of InstantExitLogs) {
    rexPenaltyAmount += Number(log.amount) / 1e18;
  }

  // Calculate xREX rebase revenue in USD
  const rexToken = tokens.find((t) => t.id === REX_TOKEN_CONTRACT);
  const rexPriceUSD = Number(rexToken?.priceUSD ?? 0);
  const dailyXrexInstantExitFeeUSD = rexPenaltyAmount * rexPriceUSD; // Voters will get the rex token as rebase


  return {
    clVolumeUSD: Number(clProtocolDayData?.[0]?.volumeUsd ?? 0),
    clFeesUSD: Number(clProtocolDayData?.[0]?.feesUsd ?? 0),
    legacyVolumeUSD: Number(legacyProtocolDayData?.[0]?.volumeUsd ?? 0),
    legacyFeesUSD: Number(legacyProtocolDayData?.[0]?.feesUsd ?? 0),
    clBribeRevenueUSD: clUserBribeRevenueUSD,
    legacyBribeRevenueUSD: legacyUserBribeRevenueUSD,
    clUserFeesRevenueUSD: Number(clProtocolDayData?.[0]?.voterFeesUsd ?? 0),
    legacyUserFeesRevenueUSD: Number(
      legacyProtocolDayData?.[0]?.voterFeesUsd ?? 0,
    ),
    clProtocolRevenueUSD: Number(clProtocolDayData?.[0]?.treasuryFeesUsd ?? 0),
    legacyProtocolRevenueUSD: Number(
      legacyProtocolDayData?.[0]?.treasuryFeesUsd ?? 0,
    ),
    dailyXrexInstantExitFeeUSD,
  };
}

const fetch = async (options: FetchOptions) => {
  const stats = await fetchStats(options);

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  
  dailyFees.addUSDValue(stats.clFeesUSD, 'Token Swap Fees')
  dailyFees.addUSDValue(stats.dailyXrexInstantExitFeeUSD, 'Instant Exit Fees')
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
  Fees: "Fees are collected from users on each swap + xREX stakers instant exit penalty + bribes revenue.",
  Revenue: "Revenue going to the protocol + Token holder Revenue.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  SupplySideRevenue: "Fees distributed to LPs (from gauged pools).",
  TokenTax: "xREX stakers instant exit penalty",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.LINEA],
  start: '2025-07-26',
  methodology,
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees paid by users on Etherex concentrated liquidity pools.',
      'Instant Exit Fees': 'xREX instant exit penalties paid by users and distributed to xREX stakers as rebase rewards.',
      'Bribes Rewards': 'Vote bribes deposited for Etherex concentrated liquidity pools.',
    },
    UserFees: {
      'Token Swap Fees': 'Swap fees paid by users on Etherex concentrated liquidity pools.',
      'Instant Exit Fees': 'xREX instant exit penalties paid by users.',
      'Bribes Rewards': 'Vote bribes deposited for Etherex concentrated liquidity pools.',
    },
    Revenue: {
      'Token Swap Fees To Holders': 'Portion of concentrated liquidity swap fees distributed to xREX holders.',
      'Token Swap Fees To Protocol': 'Treasury portion of concentrated liquidity swap fees.',
      'Bribes Revenue': 'Vote bribes distributed to xREX holders.',
    },
    ProtocolRevenue: {
      'Token Swap Fees To Protocol': 'Treasury portion of concentrated liquidity swap fees.',
    },
    HoldersRevenue: {
      'Token Swap Fees To Holders': 'Portion of concentrated liquidity swap fees distributed to xREX holders.',
      'Bribes Revenue': 'Vote bribes distributed to xREX holders.',
    },
    SupplySideRevenue: {
      'Token Swap Fees To LPs': 'Concentrated liquidity swap fees retained by LPs after holder and treasury fee shares.',
    },
  }
};

export default adapter;
