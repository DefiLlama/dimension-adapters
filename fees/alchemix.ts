import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';

interface IData {
  yieldToken: string;
  totalHarvested: string;
  minimumAmountOut: string;
}

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('GJ9CJ66TgbJnXcXGuZiSYAdGNkJBAwqMcKHEvfVmCkdG'),
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('DezAiEADYFdotrBqB8BqXFMfzCczg7eXMLowvcBvwm9X'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('GYBJ8wsQFkSwcgCqhaxnz5RU2VbgedAkWUk2qx9gTnzr')
};

const graph = (graphUrls: ChainEndpoints) => {
  const graphQuery = gql`query fees($timestampFrom: Int!, $timestampTo: Int!)
  {
    alchemistHarvestEvents(
      first: 1000
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_gte: $timestampFrom
        timestamp_lte: $timestampTo
      }
      ){
      timestamp,
      yieldToken,
      totalHarvested,
      minimumAmountOut,
      contract {
        id
      }
    }
  }`;

  return (chain: Chain) => {
    return async ({ createBalances, fromTimestamp, toTimestamp }: FetchOptions) => {
      const dailyFees = createBalances()

      const graphRes: IData[] = (await request(graphUrls[chain], graphQuery, {
        timestampFrom: fromTimestamp,
        timestampTo: toTimestamp
      })).alchemistHarvestEvents;

      graphRes.map((a: IData) => dailyFees.add(a.yieldToken, a.totalHarvested))
      const dailyRevenue = dailyFees.clone(0.1)

      return { dailyFees, dailyRevenue }
    }
  }
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    // [CHAIN.ETHEREUM]: { // index error
    //   fetch: graph(endpoints)(CHAIN.ETHEREUM),
    //   start: '2022-12-01'
    // },
    // [CHAIN.FANTOM]: {
    //   fetch: graph(endpoints)(CHAIN.FANTOM),
    //   start: '2022-12-01'
    // },
    [CHAIN.OPTIMISM]: {
      fetch: graph(endpoints)(CHAIN.OPTIMISM),
      start: '2022-12-01'
    }
  }
}

export default adapter;
