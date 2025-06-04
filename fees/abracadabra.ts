import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../adapters/types"
import { Chain } from  "../adapters/types";


const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('ktva51TWWq7t1hLnTGb88toXYtpxFo6gZfUC5NRnd9m'),
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('CnY2wTox8Pxh5t1UskQahPhMQdmuTmTAgwU62scUA8uM'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('Ak8GFBj7XruiuMd4nV3vfNzButNsj3pF7ogSBq6qdKcq'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('2RsqpTn7JBLs2sU775C7ZcM7oUrcZmpDhTnUbFCJWLfV'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('ASL3E8FZLN5AKxFoagSb7i3kFkDkMfoRovmDDLZAY8t4')
}

type DataResponse = {
  startValue: [{
    accrueInfoFeesEarned: number,
    accrueInfoFeesWithdrawn: number
  }]
  endValue: [{
    accrueInfoFeesEarned: number,
    accrueInfoFeesWithdrawn: number
  }]
}

const getFees = (data: DataResponse): number => {
  const startFees = data.startValue.reduce((prev, curr) => {
    return prev + Number(curr.accrueInfoFeesEarned) + Number(curr.accrueInfoFeesWithdrawn)
  }, 0)

  const endFees = data.endValue.reduce((prev, curr) => {
    return prev + Number(curr.accrueInfoFeesEarned) + Number(curr.accrueInfoFeesWithdrawn)
  }, 0)
  return endFees - startFees;
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({ getFromBlock, getToBlock}: FetchOptions) => {
      const [startBlock, endBlock] = await Promise.all([getFromBlock(), getToBlock()])
      const graphQuery = gql
      `query fees($startBlock: Int!, $endBlock: Int!) {
        startValue: cauldronFees(block: { number: $startBlock }) {
          accrueInfoFeesEarned
          accrueInfoFeesWithdrawn
        }
        endValue: cauldronFees(block: { number: $endBlock }) {
          accrueInfoFeesEarned
          accrueInfoFeesWithdrawn
        }
      }`;

      const graphRes: DataResponse = await request(graphUrls[chain], graphQuery, {startBlock, endBlock});
      const dailyFee = getFees(graphRes);

      const dailyFeeUsd = dailyFee;
      const dailyRevenue = dailyFeeUsd * .5;
      return {
        dailyFees: dailyFeeUsd,
        dailyRevenue,
      };
    };
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: graphs(endpoints)(CHAIN.ETHEREUM),
        start: '2021-09-01',
    },
    [CHAIN.FANTOM]: {
        fetch: graphs(endpoints)(CHAIN.FANTOM),
        start: '2021-09-01',
    },
    [CHAIN.AVAX]: {
        fetch: graphs(endpoints)(CHAIN.AVAX),
        start: '2021-09-01',
    },
    [CHAIN.BSC]: {
        fetch: graphs(endpoints)(CHAIN.BSC),
        start: '2021-09-01',
    },
    [CHAIN.ARBITRUM]: {
        fetch: graphs(endpoints)(CHAIN.ARBITRUM),
        start: '2021-09-01',
    },
  }
}

export default adapter;
