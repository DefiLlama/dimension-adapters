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
      const dailyFees = createBalances();
      const dailyRevenue = createBalances();
      const dateId = Math.floor(startOfDay);

      const graphQuery = `{ dailyRevenueSnapshot(id: ${dateId}) { cvxRevenue fraxRevenue } }`;

      const { dailyRevenueSnapshot: snapshot } = await request(
        graphUrls[chain],
        graphQuery
      );
      if (!snapshot) throw new Error("No data found");

      const cvxAmount = snapshot.cvxRevenue * 1e18;
      const fraxAmount = snapshot.fraxRevenue * 1e18;

      dailyFees.addCGToken("convex-finance", cvxAmount * 2, "CVX harvest fees");
      dailyFees.addCGToken("frax", fraxAmount * 2, "FRAX harvest fees");

      dailyRevenue.addCGToken("convex-finance", cvxAmount, "CVX protocol revenue");
      dailyRevenue.addCGToken("frax", fraxAmount, "FRAX protocol revenue");

      return { dailyFees, dailyRevenue };
    };
  };
};

const breakdownMethodology = {
  Fees: {
    "CVX harvest fees": "Total fees collected from CVX token harvests, representing the full fee amount before the protocol revenue split.",
    "FRAX harvest fees": "Total fees collected from FRAX token harvests, representing the full fee amount before the protocol revenue split.",
  },
  Revenue: {
    "CVX protocol revenue": "Protocol share (50%) of CVX harvest fees retained by CLever as revenue.",
    "FRAX protocol revenue": "Protocol share (50%) of FRAX harvest fees retained by CLever as revenue.",
  },
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(endpoints)(CHAIN.ETHEREUM),
      start: '2023-04-19',
    },
  },
  breakdownMethodology,
};

export default adapter;
