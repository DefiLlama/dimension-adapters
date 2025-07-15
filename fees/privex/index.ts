import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";

const endpoints = {
  [CHAIN.BASE]: "https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/base_analytics/latest/gn",
  [CHAIN.COTI]: "https://subgraph.prvx.aegas.it/subgraphs/name/coti-analytics"
};

// GraphQL for COTI: paginated totalHistories by timestamp
const cotiQuery = gql`
  query fees($from: Int!, $to: Int!, $skip: Int!) {
    totalHistories(
      where: { timestamp_gte: $from, timestamp_lt: $to }
      orderBy: timestamp
      orderDirection: asc
      first: 1000
      skip: $skip
    ) {
      platformFee
    }
  }
`;

// GraphQL for Base: paginated dailyHistories by day
const baseQuery = gql`
  query fees($day: Int!, $skip: Int!) {
    dailyHistories(
      where: { day: $day }
      orderBy: day
      orderDirection: desc
      first: 1000
      skip: $skip
    ) {
      platformFee
    }
  }
`;

interface ICotiResponse {
  totalHistories: Array<{ platformFee: string }>;
}
interface IBaseResponse {
  dailyHistories: Array<{ platformFee: string }>;
}

// Token addresses (chain:key format):
const USDC_BASE = "base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";      // Circle USDC on Base
const USDC_COTI = "coti:0xf1Feebc4376c68B7003450ae66343Ae59AB37D3C";     // USDC.e on COTI

const fetchCotiFees = async ({
  createBalances,
  startTimestamp,
  endTimestamp,
  chain
}: FetchOptions) => {
  let skip = 0;
  let totalRaw = new BigNumber(0);

  while (true) {
    const { totalHistories }: ICotiResponse = await request(
      endpoints[chain],
      cotiQuery,
      { from: startTimestamp, to: endTimestamp, skip }
    );
    if (!totalHistories.length) break;

    totalHistories.forEach(({ platformFee }) => {
      // platformFee is assumed to be raw USDC.e in smallest units (6 decimals)
      totalRaw = totalRaw.plus(platformFee || "0");
    });
    if (totalHistories.length < 1000) break;
    skip += totalHistories.length;
  }

  const dailyFees = createBalances();
  // Add raw USDC.e amount (6‐decimal smallest units)
  dailyFees.add(USDC_COTI, totalRaw.toFixed(0));

  return { dailyFees, dailyRevenue: dailyFees };
};

const fetchBaseFees = async ({
  createBalances,
  endTimestamp,
  chain
}: FetchOptions) => {
  const day = Math.floor(endTimestamp / 86400);
  let skip = 0;
  let totalRaw = new BigNumber(0);

  while (true) {
    const { dailyHistories }: IBaseResponse = await request(
      endpoints[chain],
      baseQuery,
      { day, skip }
    );
    if (!dailyHistories.length) break;

    dailyHistories.forEach(({ platformFee }) => {
      // platformFee is assumed to be raw USDC in smallest units (6 decimals)
      totalRaw = totalRaw.plus(platformFee || "0");
    });
    if (dailyHistories.length < 1000) break;
    skip += dailyHistories.length;
  }

  const dailyFees = createBalances();
  // Add raw USDC amount (6‐decimal smallest units)
  dailyFees.add(USDC_BASE, totalRaw.toFixed(0));

  return { dailyFees, dailyRevenue: dailyFees };
};

const methodology = {
  Fees: "Platform fees collected by PriveX in USDC from derivatives trading",
  Revenue: "All USDC platform fees represent protocol revenue",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchBaseFees,
      start: "2024-09-08",
      meta: { methodology },
    },
    [CHAIN.COTI]: {
      fetch: fetchCotiFees,
      start: "2025-01-01",
      meta: { methodology },
    },
  },
};

export default adapter;
