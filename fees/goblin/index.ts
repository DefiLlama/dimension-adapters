import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BASE_URL = "https://api.hyperion.xyz/v1/graphql";

const fetch = async (_: any, _1: any, { startOfDay }: FetchOptions) => {
  const query = gql`
    query defillamaStats($timestamp: Float!) {
      api {
        getVaultsFeeStat(timestamp: $timestamp) {
          dailyFees
        }
      }
    }
  `;

  const variables = {
    timestamp: startOfDay,
  };

  const data = await request(BASE_URL, query, variables);
  const dailyFees = data.api.getVaultsFeeStat.dailyFees;
  const dailyRevenue = Number(dailyFees) * 0.5;

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2026-01-12",
    },
  },
  methodology: {
    Fees: "The fee is charged 20% of our reward received",
    Revenue: "Revenue is calculated as 50% of the daily fees",
  },
};

export default adapter;
