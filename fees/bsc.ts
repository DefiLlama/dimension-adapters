import { Adapter } from "../adapter.type";
import { BSC } from "../helper/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapter.type"
import { Chain } from "../utils/constants";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helper/getBlock";
import { ChainBlocks } from "../adapter.type";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [BSC]:
    "https://api.thegraph.com/subgraphs/name/dmihal/bsc-validator-rewards"
}


const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number, chainBlocks: ChainBlocks) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)

      const todaysBlock = (await getBlock(todaysTimestamp, chain, chainBlocks));
      const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, chain, {}));

      const graphQuery = gql
      `query txFees {
        yesterday: fee(id: "1", block: { number: ${yesterdaysBlock} }) {
          totalFees
        }
        today: fee(id: "1", block: { number: ${todaysBlock} }) {
          totalFees
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee = new BigNumber(graphRes["today"]["totalFees"]).minus(new BigNumber(graphRes["yesterday"]["totalFees"]))

      const bnbAddress = "bsc:0x0000000000000000000000000000000000000000";
      const pricesObj: any = await getPrices([bnbAddress], todaysTimestamp);
      const latestPrice = new BigNumber(pricesObj[bnbAddress]["price"])

      const finalDailyFee = dailyFee.multipliedBy(latestPrice)
      const finalTotalFee = new BigNumber(graphRes["today"]["totalFees"]).multipliedBy(latestPrice)

      return {
        timestamp,
        totalFees: finalTotalFee.toString(),
        dailyFees: finalDailyFee.toString(),
        totalRevenue: "0",
        dailyRevenue: "0",
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [BSC]: {
        fetch: graphs(endpoints)(BSC),
        start: async ()  => 1598671449,
    },
  },
  adapterType: "chain"
}

export default adapter;
