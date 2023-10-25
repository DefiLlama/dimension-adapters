import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import BigNumber from "bignumber.js";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/aladdindaogroup/aladdin-fees",
};

const graph = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp));
      console.log(dateId);

      const graphQuery = gql`{
                    dailyRevenueSnapshot(id: ${dateId}) {
                        aCRVRevenue
                    }
                }`;

      const graphRes = await request(graphUrls[chain], graphQuery);
      Object.keys(graphRes.dailyRevenueSnapshot).map(function (k) {
        graphRes.dailyRevenueSnapshot[k] = new BigNumber(
          graphRes.dailyRevenueSnapshot[k]
        );
      });
      const snapshot = graphRes.dailyRevenueSnapshot;

      const coins = ["aladdin-cvxcrv"].map((item) => `coingecko:${item}`);
      const coinsUnique = [...new Set(coins)];
      const prices = await getPrices(coinsUnique, timestamp);
      const aCRVPrice = prices["coingecko:aladdin-cvxcrv"];

      const dailyRevenue = snapshot.aCRVRevenue.times(aCRVPrice.price);

      const dailyFees = dailyRevenue * 2;

      return {
        timestamp,
        dailyFees: dailyFees.toString(),
        dailyRevenue: dailyRevenue.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch: graph(endpoints)(ETHEREUM),
      start: async () => 1667911902,
    },
  },
};

export default adapter;
