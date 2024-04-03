import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request } from "graphql-request";
import type {
  ChainBlocks,
  ChainEndpoints,
  FetchOptions,
} from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/aladdindaogroup/aladdin-fees",
};

const graph = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (
      _timestamp: number,
      _: ChainBlocks,
      { createBalances, startOfDay }: FetchOptions
    ) => {
      let dailyRevenue = createBalances();
      const dateId = Math.floor(startOfDay);

      const graphQuery = `{ dailyRevenueSnapshot(id: ${dateId}) { wstETHRevenue } }`;

      const { dailyRevenueSnapshot: snapshot } = await request(
        graphUrls[chain],
        graphQuery
      );

      if (!snapshot) {
        dailyRevenue.addCGToken("wrapped-steth", 0);
      } else {
        dailyRevenue.addCGToken("wrapped-steth", snapshot.wstETHRevenue * 1e18);
      }


      const usd = await dailyRevenue.getUSDValue();
      const revenue = (usd / 1e18).toFixed(0);
      const dailyFees = (usd / 0.75 / 1e18).toFixed(0);
      return { timestamp: startOfDay, dailyFees, dailyRevenue: revenue };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch: graph(endpoints)(ETHEREUM),
      start: 1700524800,
    },
  },
};

export default adapter;
