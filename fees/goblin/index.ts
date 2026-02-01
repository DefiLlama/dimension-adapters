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
  
  // Goblin takes 50% from performance and management fees
  // remain 50% are distributed to goAPT staking - supply side revenue
  const dailyFees = Number(data.api.getVaultsFeeStat.dailyFees);
  const dailyRevenue = dailyFees * 0.5;
  const dailySupplySideRevenue = dailyFees - dailyRevenue;

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
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
    Fees: "Performance fees charged from all vaults.",
    Revenue: "Goblin gets 50% fees as revenue.",
    ProtocolRevenue: "Goblin gets 50% fees as revenue.",
    SupplySideRevenue: "Goblin distribute 50% fees to goAPT staking for additional yields.",
  },
};

export default adapter;
