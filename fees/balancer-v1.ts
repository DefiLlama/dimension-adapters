import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { SimpleAdapter, FetchOptions } from "../adapters/types"
import BigNumber from "bignumber.js";

const v1Endpoints = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('93yusydMYauh7cfe9jEfoGABmwnX4GffHd7in8KJi1XB'),
}

const methodology = {
  UserFees: "Trading fees paid by users, ranging from 0.0001% to 10%",
  Fees: "All trading fees collected (includes swap and  yield fee)",
  Revenue: "Protocol revenue from all fees collected",
  ProtocolRevenue: "Balancer V2 protocol fees are set to 50%",
  SupplySideRevenue: "A small percentage of the trade paid by traders to pool LPs",
}

const adapter: SimpleAdapter = {
  methodology,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async ({ getFromBlock, getToBlock }: FetchOptions) => {
        const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])

        const graphQuery = gql
          `{
          today: balancer(id: "1", block: { number: ${toBlock} }) {
            totalSwapFee
          }
          yesterday: balancer(id: "1", block: { number: ${fromBlock} }) {
            totalSwapFee
          }
        }`;

        const graphRes = await request(v1Endpoints[CHAIN.ETHEREUM], graphQuery);
        const dailyFee = (new BigNumber(graphRes["today"]["totalSwapFee"]).minus(new BigNumber(graphRes["yesterday"]["totalSwapFee"])))

        return {
          dailyFees: dailyFee,
          dailyUserFees: dailyFee,
          dailyRevenue: "0",
          dailyProtocolRevenue: "0",
          dailySupplySideRevenue: dailyFee,
        } as any
      },
      start: '2020-02-27',
    },
  }
}

export default adapter;
