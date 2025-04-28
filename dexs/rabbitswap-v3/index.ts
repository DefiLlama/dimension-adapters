import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  getTimestampAtStartOfDayUTC,
  getTimestampAtStartOfNextDayUTC,
} from "../../utils/date";
import { gql, GraphQLClient } from "graphql-request";

const graphQLClient = new GraphQLClient(
  "https://thegraph.com/explorer/api/playground/QmdNsE7Nmuj3o53y4dZ8YAeRrgesaXVp4s4GFj13dkevZG"
);

const getDailyVolume = () => {
  return gql`
    query RabbitSwapDailyVol($dateTimestamp: Int) {
      daily: uniDayDatas(where: { timestamp: $dateTimestamp }) {
        volumeUSD
        feesUSD
      }
    }
  `;
};

interface IDailyResponse {
  daily: Array<{
    volumeUSD: string;
    feesUSD: string;
  }>;
}

const getTotalVolume = () => {
  return gql`
    query RabbitSwapTotalVol($first: Int, $skip: Int) {
      total: uniDayDatas(
        orderBy: timestamp
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        timestamp
        volumeUSD
        feesUSD
      }
    }
  `;
};

interface ITotalResponse {
  total: Array<{
    volumeUSD: string;
    feesUSD: string;
  }>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const retryRequest = async <T>(fn: () => Promise<T>): Promise<T> => {
  let lastError;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  throw lastError;
};

const fetch = async (timestamp: number) => {
  const dateTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const [dailyResponse, [totalVolume, totalFees]] = await Promise.all([
    retryRequest(() =>
      graphQLClient.request(getDailyVolume(), { dateTimestamp })
    ) as Promise<IDailyResponse>,
    fetchTotalMetrics(),
  ]);

  const dailyVolume = dailyResponse?.daily?.[0]?.volumeUSD ?? "0";
  const dailyFees = dailyResponse?.daily?.[0]?.feesUSD ?? "0";

  return {
    timestamp,
    dailyVolume,
    totalVolume,
    dailyFees,
    totalFees,
    dailyUserFees: dailyFees,
    totalUserFees: totalFees,
  };
};

const fetchTotalMetrics = async (): Promise<[string, string]> => {
  const PAGE_SIZE = 500;
  let skip = 0;
  let hasMore = true;
  let totalVolume = 0;
  let totalFees = 0;

  while (hasMore) {
    const response = await retryRequest<ITotalResponse>(() =>
      graphQLClient.request(getTotalVolume(), {
        first: PAGE_SIZE,
        skip,
      })
    );

    const data = response?.total || [];
    if (data.length === 0) {
      hasMore = false;
      continue;
    }

    for (const day of data) {
      totalVolume += Number(day.volumeUSD);
      totalFees += Number(day.feesUSD);
    }

    skip += PAGE_SIZE;
    hasMore = data.length === PAGE_SIZE;
  }

  return [totalVolume.toString(), totalFees.toString()];
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TOMOCHAIN]: {
      fetch: fetch,
      start: "2024-11-12",
      meta: {
        methodology: {
          Volume: "USD Volume of RabbitSwap V3 using datasource from SubQuery.",
          Fees: "USD Fees of RabbitSwap V3 using datasource from SubQuery.",
        },
      },
    },
  },
};

export default adapter;
