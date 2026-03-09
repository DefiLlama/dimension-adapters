import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { METRIC } from "../helpers/metrics";

interface IData {
  id: string;
  todayETHRevenue: string;
}

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('7Trkrt6hPzhLXUH2x4Xt9cSnSmAFKDmKNWuUHEwzgCYJ')
};

const fetch = async (_a: any, _b: any, { createBalances, fromTimestamp, toTimestamp, }: FetchOptions) => {
  const dailyFees = createBalances()

  const graphQuery = gql`query fees($timestampFrom: Int!, $timestampTo: Int!)
    {
      dailyRevenueAggregators(where:{id_gte:$timestampFrom, id_lte:$timestampTo})
      {
        id
        todayETHRevenue
      }
    }`
    ;

  const graphRes: IData[] = (await request(endpoints[CHAIN.ETHEREUM], graphQuery, {
    timestampFrom: fromTimestamp,
    timestampTo: toTimestamp
  })).dailyRevenueAggregators;
  const value = graphRes.reduce((acc, cur) => acc + Number(cur.todayETHRevenue), 0);

  dailyFees.addGasToken(value, METRIC.PROTOCOL_FEES)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}


const adapter: Adapter = {
  fetch,
  start: '2023-08-12',
  chains: [CHAIN.ETHEREUM],
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "ETH collected as revenue by the Hono protocol aggregator, sourced from the subgraph dailyRevenueAggregators entity",
    },
  },
}

export default adapter;
