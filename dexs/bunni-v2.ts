import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { request, } from "graphql-request";
import type { FetchOptions, SimpleAdapter } from "../adapters/types";

const endpoints: any = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('5NFnHtgpdzB3JhVyiKQgnV9dZsewqJtX5HZfAT9Kg66r'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('96tZMr51QupqWYamom12Yki5AqCJEiHWbVUpzUpvu9oB'),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('3oawHiCt7L9wJTEY9DynwAEmoThy8bvRhuMZdaaAooqW'),
  [CHAIN.UNICHAIN]: sdk.graph.modifyEndpoint('J22JEPtqL847G44v7E5gTsxmNosoLtKQUDAvnhRhzj25'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('FfnRstqDWGGevsbf9rRg1vNctrb38Hd791zzaaKc7AGz'),
};

const fetch = async (timestamp: number, _: any, { chain }: FetchOptions) => {
  const endpoint = endpoints[chain]

  const graphQuery = `{
  protocolDaySnapshots (first:1000, orderBy: periodEnd, orderDirection: desc) {
    id
    volumeUSD
    periodStart
    periodEnd
    totalValueLockedUSD
    swapFeesUSD
    hookFeesUSD
  }
}`;

  const { protocolDaySnapshots } = await request(endpoint, graphQuery);
  const snapshot = protocolDaySnapshots.find((snapshot: any) => +snapshot.periodStart <= timestamp && +snapshot.periodEnd >= timestamp);

  if (!snapshot) return {
    dailyVolume: 0,
    dailyFees: 0,
  }

  return {
    dailyVolume: snapshot.volumeUSD,
    dailyFees: +snapshot.swapFeesUSD + +snapshot.hookFeesUSD,
  }
};

const adapter: SimpleAdapter = {
  doublecounted: true,
  fetch, 
  chains: Object.keys(endpoints),
   methodology: {
    Fees: 'Swap and hook fees paid by users.',
  }
};

export default adapter;
