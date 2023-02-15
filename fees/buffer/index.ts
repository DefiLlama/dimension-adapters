import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { Adapter } from "../../adapters/types"

const endpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/bufferfinance/buffer-mainnet"
}


const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400)

      const graphQuery = gql
      `{
        dailyRevenueAndFee(id: ${dateId}) {
          totalFee
          settlementFee
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);
      const dailyFee = new BigNumber(graphRes.dailyRevenueAndFee.settlementFee).div(1000000);
      const protocolRev = new BigNumber(graphRes.dailyRevenueAndFee.settlementFee).div(1000000).times(0.05);
      const userHolderRev = new BigNumber(graphRes.dailyRevenueAndFee.settlementFee).div(1000000).times(0.4);
      const supplySideRev = new BigNumber(graphRes.dailyRevenueAndFee.settlementFee).div(1000000).times(0.55);

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyProtocolRevenue: protocolRev.toString(),
        dailyUserHolderRevenue: userHolderRev.toString(),
        dailySupplySideRevenue: supplySideRev.toString(),
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
        fetch: graphs(endpoints)(CHAIN.ARBITRUM),
        start: async ()  => 1674993600 ,
    },
  }
}

export default adapter;