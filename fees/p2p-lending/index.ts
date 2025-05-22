import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { FetchOptions, FetchResult } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const headers: HeadersInit = {
  origin: "https://subgraph.smardex.io",
  referer: "https://subgraph.smardex.io",
  "x-api-key": process.env.SMARDEX_SUBGRAPH_API_KEY || "",
};

type TokenSubgraphData = {
  id: string;
  totalInterestPaid: number;
};

const sdexAddress = "0x5de8ab7e27f6e7a1fff3e5b337584aa43961beef";
const subgraphUrl = "https://subgraph.smardex.io/ethereum/spro";

const getTokenPriceAtTimestamp = async (timestamp: number, tokenAddress: string) => {
  try {
    const prices = await fetchURL(`https://coins.llama.fi/prices/historical/${timestamp}/ethereum:${tokenAddress}`);
    const tokenPriceData = prices.coins[`ethereum:${tokenAddress}`];
    if (!tokenPriceData) {
      throw new Error(`No price data found for token ${tokenAddress} at timestamp ${timestamp}`);
    }
    return tokenPriceData.price;
  } catch (error) {
    return 0;
  }
};

const getDailyTokenMetrics = async (timestamp: number): Promise<TokenSubgraphData[]> => {
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
 * Fetch the fees from the subgraph for a given timestamp.
 * @param timestamp - The timestamp to fetch fees for.
 * @returns An object containing the total SDEX burnt and the total interest paid.
 */
const getFeesFromSubgraph = async (timestamp: number) => {
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
    const totalInterestPaidsInUsd = await Promise.all(
      dailyTokenMetrics.map(async (token: TokenSubgraphData) => {
        const tokenAddress = token.id.split("-")[1];
        const price = await getTokenPriceAtTimestamp(timestamp, tokenAddress);
        return token.totalInterestPaid * price;
      })
    );
    const totalInterestPaidInUsd = totalInterestPaidsInUsd.reduce((acc: number, curr: number) => acc + curr, 0) / 1e18;
    const sdexPrice = await getTokenPriceAtTimestamp(timestamp, sdexAddress);

    return {
      totalSdexBurntInUsd: (dailyGlobalMetrics?.totalSdexBurnt * sdexPrice) / 1e18 || 0,
      totalInterestPaidInUsd,
    };
  } catch (error) {
    return {
      totalSdexBurntInUsd: 0,
      totalInterestPaidInUsd: 0,
    };
  }
};

const fetch = async (_: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
  const timestamp = options.startOfDay;
  const metrics = await getFeesFromSubgraph(timestamp);

  return {
    dailyFees: metrics.totalSdexBurntInUsd + metrics.totalInterestPaidInUsd,
    dailyRevenue: metrics.totalSdexBurntInUsd,
  };
};

const adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2022-03-14",
    },
  },
  version: 1,
};

export default adapter;
