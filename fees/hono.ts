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
    dailyRevenueAggregators(where:{id_gte:$timestampFrom, id_lte:$timestampTo})
    {
      id
      todayETHRevenue
    }
  }`;

  return (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultFees> => {
      const fromTimestamp = timestamp - 60 * 60 * 24
      const toTimestamp = timestamp

      try {
        const graphRes: IData[] = (await request(graphUrls[chain], graphQuery, {
          timestampFrom: fromTimestamp,
          timestampTo: toTimestamp
        })).dailyRevenueAggregators;
        const ethcoinID = "ethereum:0x0000000000000000000000000000000000000000";
        const prices = await getPrices([ethcoinID], timestamp);
        const value = graphRes.reduce((acc, cur) => acc + Number(cur.todayETHRevenue)/10**18, 0);
        const dailyRevenue = (value) * prices[ethcoinID].price;
        const dailyFees = dailyRevenue;
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyRevenue}`,
        timestamp
      }
      } catch (error) {
        console.error(error);
        throw error;
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
