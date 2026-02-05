import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../adapters/types";
import { Chain } from "../adapters/types";

const endpoints = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('CCaEZU1PJyNaFmEjpyc4AXUiANB6M6DGDCJuWa48JWTo'),
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
    [CHAIN.ETHEREUM]: {
      fetch: graph(endpoints)(CHAIN.ETHEREUM),
      start: '2023-04-19',
    },
  },
};

export default adapter;
