import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GRAPHQL_URL = "https://api-mainnet.kanalabs.io/graphql";

export enum KanaChainID {
  "aptos" = 2
}

const fetch = async (timestamp: number, t: any, options: FetchOptions) => {
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
  const dailyFees = result.today;

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Fees are collected from the users when they trade on Kana Perps.",
  Revenue: "Revenue is the sum of fees collected from the users.",
  ProtocolRevenue: "Protocol revenue is the sum of fees collected from the users.",
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2024-09-12',
    },
  },
  methodology,
};

export default adapter;
