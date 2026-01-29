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
  
  // Goblin is curator for hyperion vaults
  // it share 50% from performance and management fees
  const dailyFees = Number(data.api.getVaultsFeeStat.dailyFees) * 0.5;

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
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
    Fees: "Goblin gets 50% share of performance and management fees from hyperion vaults.",
    Revenue: "Goblin gets 50% share of performance and management fees from hyperion vaults.",
    ProtocolRevenue: "Goblin gets 50% share of performance and management fees from hyperion vaults.",
  },
};

export default adapter;
