import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN} from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getPrices } from "../utils/prices";


interface IData {
  id: string;
  todayETHRevenue: string;
}

const endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/nuoanunu/defilahma-revenue-hono"
};

const graph = (graphUrls: ChainEndpoints) => {
  const graphQuery = gql`query fees($timestampFrom: Int!, $timestampTo: Int!)
  {
    dailyRevenueAggregators(first:1, where:{id_gte:$timestampFrom, id_lte:$timestampTo})
    {
      id
      todayETHRevenue
    }
  }`;

  return (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultFees> => {

      const fromTimestamp = timestamp - 60 * 60 * 24
      const toTimestamp = timestamp

      const graphRes: IData[] = (await request(graphUrls[chain], graphQuery, {
        timestampFrom: fromTimestamp,
        timestampTo: toTimestamp
      })).dailyRevenueAggregators;

      const prices = await getPrices(["ethereum:0x0000000000000000000000000000000000000000"], timestamp);
      try {
        const dailyRevenue = (Number(graphRes[0].todayETHRevenue))/10**18 * prices["ethereum:0x0000000000000000000000000000000000000000"].price;
      return {
        dailyRevenue: `${dailyRevenue}`,
        timestamp
      }
      } catch (error) {
    
      }
      return {
        dailyRevenue: `${0}`,
        timestamp
      }
    }
  }
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(endpoints)(CHAIN.ETHEREUM),
      start: async () => 1691798400
    }
  }
}

export default adapter;
