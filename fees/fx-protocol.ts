import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request } from "graphql-request";
import type {
  ChainBlocks,
  ChainEndpoints,
  FetchOptions,
} from "../adapters/types";
import { Chain } from "../adapters/types";

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint(
    "CCaEZU1PJyNaFmEjpyc4AXUiANB6M6DGDCJuWa48JWTo"
  ),
};
const graph = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (
      _timestamp: number,
      _: ChainBlocks,
      { createBalances, startOfDay }: FetchOptions
    ) => {
      let dailyRevenue = createBalances();
      let dailyRevenueFxV2 = createBalances();
      const dateId = Math.floor(startOfDay);

      const graphQuery = `{ dailyRevenueSnapshot(id: ${dateId}) { wstETHRevenueFxV2  wstETHRevenue } }`;
      const { dailyRevenueSnapshot: snapshot } = await request(
        graphUrls[chain],
        graphQuery
      );
      if (!snapshot) {
        dailyRevenue.addCGToken("wrapped-steth", 0);
        dailyRevenueFxV2.addCGToken("wrapped-steth", 0);
      } else {
        dailyRevenue.addCGToken("wrapped-steth", snapshot.wstETHRevenue * 1e18);
        dailyRevenueFxV2.addCGToken(
          "wrapped-steth",
          snapshot.wstETHRevenueFxV2 * 1e18
        );
      }

      const usd = await dailyRevenue.getUSDValue();
      const usdFxV2 = await dailyRevenueFxV2.getUSDValue();
      const revenue = (usd / 1e18).toFixed(0);
      const dailyFees = (usd / 0.75 / 1e18 + usdFxV2 / 1e18).toFixed(0);
      return { timestamp: startOfDay, dailyFees, dailyRevenue: revenue };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(endpoints)(CHAIN.ETHEREUM),
      start: "2023-11-21",
    },
  },
};

export default adapter;
