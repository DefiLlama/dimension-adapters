import * as sdk from "@defillama/sdk";
import { Adapter, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, } from "graphql-request";
import type { FetchOptions } from "../adapters/types";

const endpoints: any = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('5NFnHtgpdzB3JhVyiKQgnV9dZsewqJtX5HZfAT9Kg66r'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('96tZMr51QupqWYamom12Yki5AqCJEiHWbVUpzUpvu9oB'),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('3oawHiCt7L9wJTEY9DynwAEmoThy8bvRhuMZdaaAooqW'),
};

const fetch = async (timestamp: number, _: any, { chain }: FetchOptions) => {
  const endpoint = endpoints[chain]

  const graphQuery = `{
  protocolDaySnapshots (first:1000) {
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
  return {
    timestamp,
    dailyVolume: snapshot.volumeUSD,
    dailyFees: +snapshot.swapFeesUSD + +snapshot.hookFeesUSD,
  }
};

const adapter: Adapter = {
  adapter: {},
};

Object.keys(endpoints).forEach((chain) => { adapter.adapter[chain] = { fetch } });

export default adapter;
