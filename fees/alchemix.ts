import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainBlocks, ChainEndpoints, FetchOptions } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';

interface IData {
  yieldToken: string;
  totalHarvested: string;
  minimumAmountOut: string;
}

const endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/alchemix-finance/alchemix_v2",
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/alchemix-finance/alchemix_v2_ftm",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/alchemix-finance/alchemix_v2_optimisim"
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
    return async (timestamp: number, _: ChainBlocks, { createBalances, fromTimestamp, toTimestamp }: FetchOptions): Promise<FetchResultFees> => {
      const dailyFees = createBalances()

      const graphRes: IData[] = (await request(graphUrls[chain], graphQuery, {
        timestampFrom: fromTimestamp,
        timestampTo: toTimestamp
      })).alchemistHarvestEvents;

      graphRes.map((a: IData) => dailyFees.add(a.yieldToken, a.totalHarvested))
      const dailyRevenue = dailyFees.clone(0.1)

      return { dailyFees, dailyRevenue, timestamp }
    }
  }
};


const adapter: Adapter = {
  adapter: {
    // [CHAIN.ETHEREUM]: { // index error
    //   fetch: graph(endpoints)(CHAIN.ETHEREUM),
    //   start: 1669852800
    // },
    // [CHAIN.FANTOM]: {
    //   fetch: graph(endpoints)(CHAIN.FANTOM),
    //   start: 1669852800
    // },
    [CHAIN.OPTIMISM]: {
      fetch: graph(endpoints)(CHAIN.OPTIMISM),
      start: 1669852800
    }
  }
}

export default adapter;
