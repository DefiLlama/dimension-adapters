import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { FetchOptions, FetchResult } from "../../adapters/types";

const headers: HeadersInit = {
  origin: "https://subgraph.smardex.io",
  referer: "https://subgraph.smardex.io",
  "x-api-key": process.env.SMARDEX_SUBGRAPH_API_KEY || "",
};

type DailyTokenMetric = {
  id: string;
  totalInterestPaid: string;
};

const sdexAddress = "0x5de8ab7e27f6e7a1fff3e5b337584aa43961beef";
const subgraphUrl = "https://subgraph.smardex.io/ethereum/spro";

const getDailyTokenMetrics = async (timestamp: number): Promise<DailyTokenMetric[]> => {
  const dailyTokenMetricsQuery = `
      {
        dailyTokenMetrics_collection (where: {
          day: "${timestamp}"
        }) {
          id
          totalInterestPaid
        }
      }`;

  const result = await request(subgraphUrl, dailyTokenMetricsQuery, {}, headers);
  return result.dailyTokenMetrics_collection || [];
};

/*
 * Fetch the metrics from the subgraph for a given timestamp.
 * @param timestamp - The timestamp to fetch fees for.
 * @returns An object containing the total SDEX burnt and daily token metrics.
 */
const getMetricsFromSubgraph = async (timestamp: number) => {
  try {
    const dailyGlobalMetricsQuery = `{
      dailyGlobalMetrics_collection (where: {
        id: "${timestamp}"
      }) {
        totalSdexBurnt
      }
    }`;

    const dailyGlobalMetrics = (await request(subgraphUrl, dailyGlobalMetricsQuery, {}, headers))
      .dailyGlobalMetrics_collection[0];

    const dailyTokenMetrics = await getDailyTokenMetrics(timestamp);

    return {
      totalSdexBurnt: dailyGlobalMetrics?.totalSdexBurnt || 0,
      dailyTokenMetrics: dailyTokenMetrics.map((token) => ({
        // Token id is in the form <timestamp>-<tokenId>
        id: token.id.split("-")[1],
        totalInterestPaid: parseFloat(token.totalInterestPaid),
      })),
    };
  } catch (error) {
    return {
      totalSdexBurnt: 0,
      dailyTokenMetrics: [],
    };
  }
};

const fetch = async (_: number, _t: any, { startOfDay, createBalances }: FetchOptions): Promise<FetchResult> => {
  const timestamp = startOfDay;
  const metrics = await getMetricsFromSubgraph(timestamp);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  dailyFees.addToken(sdexAddress, metrics.totalSdexBurnt);
  metrics.dailyTokenMetrics.forEach((token) => {
    dailyFees.addToken(token.id, token.totalInterestPaid);
  });

  dailyRevenue.addToken(sdexAddress, metrics.totalSdexBurnt);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter = {
  methodology: {
    Fees: "Protocol fees are given by interests paid in credit Tokens by Borrowers to Lenders, cumulated with the amount of SDEX burned at Proposal creation.",
    Revenue: "Protocol revenue is the total amount of SDEX burned at each new Proposal creation.",
  },
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-05-22",
    },
  },
  version: 1,
};

export default adapter;
