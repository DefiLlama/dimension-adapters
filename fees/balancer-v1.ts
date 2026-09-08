import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { SimpleAdapter, FetchOptions } from "../adapters/types"

const v1Endpoints = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('93yusydMYauh7cfe9jEfoGABmwnX4GffHd7in8KJi1XB'),
}

const LABELS = {
  SwapFees: 'Token Swap Fees',
  SwapFeesToLPs: 'Token Swap Fees To LPs',
}

const methodology = {
  UserFees: "Trading fees paid by users, set per pool by the pool creator (0.0001% to 10%)",
  Fees: "All swap fees collected from trades across Balancer V1 pools",
  Revenue: "Balancer V1 takes no protocol fee, so protocol revenue is zero",
  ProtocolRevenue: "Balancer V1 takes no protocol fee, so protocol revenue is zero",
  SupplySideRevenue: "All swap fees are distributed to pool liquidity providers",
}

const breakdownMethodology = {
  UserFees: {
    [LABELS.SwapFees]: "Swap fees paid by users on each trade",
  },
  Fees: {
    [LABELS.SwapFees]: "All swap fees collected from trades across Balancer V1 pools",
  },
  SupplySideRevenue: {
    [LABELS.SwapFeesToLPs]: "100% of swap fees are distributed to pool liquidity providers",
  },
}

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async ({ getFromBlock, getToBlock, createBalances }: FetchOptions) => {
        const dailyFees = createBalances();
        const dailySupplySideRevenue = createBalances();
        
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
        const swapFees = Number(graphRes["today"]["totalSwapFee"]) - Number(graphRes["yesterday"]["totalSwapFee"])
        dailyFees.addUSDValue(swapFees, LABELS.SwapFees)
        dailySupplySideRevenue.addUSDValue(swapFees, LABELS.SwapFeesToLPs)

        return {
          dailyFees,
          dailyUserFees: dailyFees,
          dailyRevenue: "0",
          dailyProtocolRevenue: "0",
          dailySupplySideRevenue,
        } as any
      },
      start: '2020-02-27',
    },
  },
}

export default adapter;
