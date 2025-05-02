import * as sdk from "@defillama/sdk";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainBlocks, ChainEndpoints, FetchOptions } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';

interface IData {
  id: string;
  todayETHRevenue: string;
}

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('7Trkrt6hPzhLXUH2x4Xt9cSnSmAFKDmKNWuUHEwzgCYJ')
};

const graph = (graphUrls: ChainEndpoints) => {
  const graphQuery = gql`query fees($timestampFrom: Int!, $timestampTo: Int!)
  {
    dailyRevenueAggregators(where:{id_gte:$timestampFrom, id_lte:$timestampTo})
    {
      id
      todayETHRevenue
    }
  }`;

  return (chain: Chain) => {
    return async (timestamp: number, _: ChainBlocks, { createBalances, fromTimestamp, toTimestamp, }: FetchOptions): Promise<FetchResultFees> => {
      const dailyFees = createBalances()

      const graphRes: IData[] = (await request(graphUrls[chain], graphQuery, {
        timestampFrom: fromTimestamp,
        timestampTo: toTimestamp
      })).dailyRevenueAggregators;
      const value = graphRes.reduce((acc, cur) => acc + Number(cur.todayETHRevenue), 0);
      dailyFees.addGasToken(value)
      return {
        dailyFees,
        dailyRevenue: dailyFees,
        timestamp
      }
    }
  }
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(endpoints)(CHAIN.ETHEREUM),
      start: '2023-08-12'
    }
  }
}

export default adapter;
