import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GRAPHQL_URL = "https://api-mainnet.kanalabs.io/graphql";

export enum KanaChainID {
  "aptos" = 2
}

const fetchPerpsRevenue = async (timestamp: number, t: any, options: FetchOptions) => {
  const dayTimestamp = options.startOfDay + 86400;

  const query = gql`
    query getPerpsRevenueSummary($day_ts: Float!, $chainId: Float!) {
      getPerpsRevenueSummary(day_ts: $day_ts, chainId: $chainId)
    }
  `;

  const variables = {
    day_ts: dayTimestamp - 1,
    chainId: KanaChainID.aptos,
  };

  const data = await request(GRAPHQL_URL, query, variables);
  const result = data.getPerpsRevenueSummary;

  return {
    timestamp,
    dailyRevenue: result.today,
    totalRevenue: result.total,
  };
};

const startTimeBlock = 1695897800;

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: async (timestamp: number, t: any, options: FetchOptions) => {
        const revenue = await fetchPerpsRevenue(timestamp, t, options);
        return {
          dailyRevenue: revenue.dailyRevenue.toString(),
          totalRevenue: revenue.totalRevenue.toString(),
          timestamp,
        };
      },
      start: startTimeBlock,
    },
  },
};

export default adapter;
