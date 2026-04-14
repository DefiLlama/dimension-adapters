import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type {
  ChainBlocks,
  ChainEndpoints,
  FetchOptions,
} from "../adapters/types";
import { Chain } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

const priceUrl = "https://api.aladdin.club/api/coingecko/price";

const endpoints = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('CCaEZU1PJyNaFmEjpyc4AXUiANB6M6DGDCJuWa48JWTo'),
};

const graph = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (
      _timestamp: number,
      _: ChainBlocks,
      { startOfDay }: FetchOptions
    ) => {
      const dateId = Math.floor(startOfDay);
      const graphQuery = gql`{
                    dailyRevenueSnapshot(id: ${dateId}) {
                        aCRVRevenue
                    }
                }`;

      const { dailyRevenueSnapshot: snapshot } = await request(
        graphUrls[chain],
        graphQuery
      );
      if (!snapshot) throw new Error("No data found");

      const { aCRV } = (await fetchURL(priceUrl))?.data;

      const dailyRevenue = snapshot.aCRVRevenue;

      const usd = dailyRevenue * aCRV.usd;
      const revenue = usd.toFixed(0);
      const dailyFees = (usd * 2).toFixed(0);

      return { timestamp: startOfDay, dailyFees, dailyRevenue: revenue };
    };
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(endpoints)(CHAIN.ETHEREUM),
      start: '2022-11-08',
    },
  },
};

export default adapter;
