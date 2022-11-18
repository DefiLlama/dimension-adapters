import { Adapter } from "../adapters/types";
import { POLYGON } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";

const endpoints = {
  [POLYGON]: "https://api.thegraph.com/subgraphs/name/perp88/plp-pool",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const graphQuery = gql`
        {
          statistic(id: 0) {
            totalFees
          }
        }
      `;

      const graphRes = await request(graphUrls[chain], graphQuery);
      const totalFees = parseInt(graphRes.statistic.totalFees) / 1e30;

      return {
        timestamp,
        totalFees: totalFees.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [POLYGON]: {
      fetch: graphs(endpoints)(POLYGON),
      start: async () => 0,
    },
  },
};

export default adapter;
