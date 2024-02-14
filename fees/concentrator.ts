import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainBlocks, ChainEndpoints, FetchOptions } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/aladdindaogroup/aladdin-fees",
};

const graph = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions) => {
      const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp));
      const graphQuery = gql`{
                    dailyRevenueSnapshot(id: ${dateId}) {
                        aCRVRevenue
                    }
                }`;

      const { dailyRevenueSnapshot: snapshot } = await request(graphUrls[chain], graphQuery);
      if (!snapshot) throw new Error("No data found");
      const dailyRevenue = createBalances();
      dailyRevenue.addCGToken("aladdin-crv", snapshot.aCRVRevenue);
      const dailyFees = dailyRevenue.clone(2);
      return { timestamp, dailyFees, dailyRevenue };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch: graph(endpoints)(ETHEREUM),
      start: 1667911902,
    },
  },
};

export default adapter;
