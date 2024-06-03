import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';


const endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/ap0calyp/abracadabra-mainnet-fees",
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/ap0calyp/abracadabra-fantom-fees",
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/ap0calyp/abracadabra-avalanche-fees",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/ap0calyp/abracadabra-binancesmartchain-fees",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/ap0calyp/abracadabra-arbitrum-fees"
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
        dailyFees: dailyFeeUsd.toString(),
        dailyRevenue: dailyRevenue.toString(),
      };
    };
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: graphs(endpoints)(CHAIN.ETHEREUM),
        start: 1630468800,
    },
    [CHAIN.FANTOM]: {
        fetch: graphs(endpoints)(CHAIN.FANTOM),
        start: 1630468800,
    },
    [CHAIN.AVAX]: {
        fetch: graphs(endpoints)(CHAIN.AVAX),
        start: 1630468800,
    },
    [CHAIN.BSC]: {
        fetch: graphs(endpoints)(CHAIN.BSC),
        start: 1630468800,
    },
    [CHAIN.ARBITRUM]: {
        fetch: graphs(endpoints)(CHAIN.ARBITRUM),
        start: 1630468800,
    },
  }
}

export default adapter;
