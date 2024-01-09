import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN} from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getPrices } from "../utils/prices";


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
    return async (timestamp: number): Promise<FetchResultFees> => {

      const fromTimestamp = timestamp - 60 * 60 * 24
      const toTimestamp = timestamp

      const graphRes: IData[] = (await request(graphUrls[chain], graphQuery, {
        timestampFrom: fromTimestamp,
        timestampTo: toTimestamp
      })).alchemistHarvestEvents;

      const coins = [...new Set(graphRes.map((a: IData) => `${chain}:${a.yieldToken.toLowerCase()}`))]
      const prices = await getPrices(coins, timestamp);
      const feesAmount = graphRes.map((a: IData) =>  {
        const price = prices[`${chain}:${a.yieldToken.toLowerCase()}`].price;
        const decimals = prices[`${chain}:${a.yieldToken.toLowerCase()}`].decimals;
        const amount = ((Number(a.totalHarvested)) / 10 ** decimals) * price;
        return amount;
      }).reduce((a: number, b: number) => a + b, 0);
      const dailyFee = feesAmount;
      const dailyRevenue = dailyFee * 0.1;

      return {
        dailyFees: `${dailyFee}`,
        dailyRevenue: `${dailyRevenue}`,
        timestamp
      }
    }
  }
};


const adapter: Adapter = {
  adapter: {
    // [CHAIN.ETHEREUM]: { // index error
    //   fetch: graph(endpoints)(CHAIN.ETHEREUM),
    //   start: async () => 1669852800
    // },
    // [CHAIN.FANTOM]: {
    //   fetch: graph(endpoints)(CHAIN.FANTOM),
    //   start: async () => 1669852800
    // },
    [CHAIN.OPTIMISM]: {
      fetch: graph(endpoints)(CHAIN.OPTIMISM),
      start: async () => 1669852800
    }
  }
}

export default adapter;
