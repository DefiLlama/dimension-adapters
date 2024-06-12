import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";

const endpoints = {
  [ETHEREUM]:
    `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/CCaEZU1PJyNaFmEjpyc4AXUiANB6M6DGDCJuWa48JWTo`,
};

const graph = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({ createBalances, startOfDay }: FetchOptions) => {
      const dailyRevenue = createBalances();
      const dateId = Math.floor(startOfDay);

      const graphQuery = `{ dailyRevenueSnapshot(id: ${dateId}) { cvxRevenue fraxRevenue } }`;

      const { dailyRevenueSnapshot: snapshot } = await request(
        graphUrls[chain],
        graphQuery
      );
      if (!snapshot) throw new Error("No data found");

      dailyRevenue.addCGToken("convex-finance", snapshot.cvxRevenue * 1e18);
      dailyRevenue.addCGToken("frax", snapshot.fraxRevenue * 1e18);

      const usd = await dailyRevenue.getUSDValue();
      const revenue = (usd / 1e18).toFixed(0);
      const dailyFees = ((usd * 2) / 1e18).toFixed(0);

      return { dailyFees, dailyRevenue: revenue };
    };
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [ETHEREUM]: {
      fetch: graph(endpoints)(ETHEREUM),
      start: 1681908702,
    },
  },
};

export default adapter;
