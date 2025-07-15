import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";

const endpoints = {
  [CHAIN.BASE]: "https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/base_analytics/latest/gn",
  [CHAIN.COTI]: "https://subgraph.prvx.aegas.it/subgraphs/name/coti-analytics"
};

// COTI: totalHistories with timestamp range + pagination
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

// Base: dailyHistories by day + pagination
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

const fetchCotiFees = async ({
  createBalances,
  startTimestamp,
  endTimestamp,
  chain
}: FetchOptions) => {
  try {
    let skip = 0;
    let totalDecimal = new BigNumber(0);

    // Aggregate decimal platformFee values
    while (true) {
      const { totalHistories }: ICotiResponse = await request(
        endpoints[chain],
        cotiQuery,
        { from: startTimestamp, to: endTimestamp, skip }
      );
      if (!totalHistories.length) break;

      totalHistories.forEach(({ platformFee }) => {
        totalDecimal = totalDecimal.plus(platformFee || "0");
      });
      if (totalHistories.length < 1000) break;
      skip += totalHistories.length;
    }

    // Convert decimal sum to raw wei integer string
    const totalWei = totalDecimal.multipliedBy("1e18").integerValue().toString();

    const dailyFees = createBalances();
    dailyFees.addGasToken(totalWei);

    return { dailyFees, dailyRevenue: dailyFees };
  } catch (error) {
    console.error("Error fetching COTI fees:", error);
    const dailyFees = createBalances();
    return { dailyFees, dailyRevenue: dailyFees };
  }
};

const fetchBaseFees = async ({
  createBalances,
  endTimestamp,
  chain
}: FetchOptions) => {
  try {
    const day = Math.floor(endTimestamp / 86400);
    let skip = 0;
    let totalDecimal = new BigNumber(0);

    while (true) {
      const { dailyHistories }: IBaseResponse = await request(
        endpoints[chain],
        baseQuery,
        { day, skip }
      );
      if (!dailyHistories.length) break;

      dailyHistories.forEach(({ platformFee }) => {
        totalDecimal = totalDecimal.plus(platformFee || "0");
      });
      if (dailyHistories.length < 1000) break;
      skip += dailyHistories.length;
    }

    const totalWei = totalDecimal.multipliedBy("1e18").integerValue().toString();

    const dailyFees = createBalances();
    dailyFees.addGasToken(totalWei);

    return { dailyFees, dailyRevenue: dailyFees };
  } catch (error) {
    console.error("Error fetching Base fees:", error);
    const dailyFees = createBalances();
    return { dailyFees, dailyRevenue: dailyFees };
  }
};

const methodology = {
  Fees: "Platform fees collected by PriveX from derivatives trading activities",
  Revenue: "All platform fees collected represent protocol revenue",
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
