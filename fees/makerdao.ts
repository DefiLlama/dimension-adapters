import { Adapter } from "../adapter.type";
import { ETHEREUM } from "../helper/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapter.type"
import { Chain } from "../utils/constants";
import { getBlock } from "../helper/getBlock";
import { ChainBlocks } from "../adapter.type";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/protofire/maker-protocol"
}


const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number, chainBlocks: ChainBlocks) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)

      const todaysBlock = (await getBlock(todaysTimestamp, chain, chainBlocks));
      const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, chain, {}));

      const graphQuery = gql
      `query fees {
        yesterday: collateralTypes(block: {number: ${yesterdaysBlock}}) {
          id
          totalDebt
          stabilityFee
        }
        today: collateralTypes(block: {number: ${todaysBlock}}) {
          id
          totalDebt
          stabilityFee
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const secondsBetweenDates = todaysTimestamp - yesterdaysTimestamp;
      
      const todayDebts: { [id: string]: BigNumber } = {};
      let dailyFee = new BigNumber(0)

      for (const collateral of graphRes["today"]) {
        todayDebts[collateral.id] = new BigNumber(collateral["totalDebt"]);
      }

      for (const collateral of graphRes["yesterday"]) {
        if (todayDebts[collateral.id]) {
          const avgDebt = todayDebts[collateral.id].plus(new BigNumber(collateral["totalDebt"])).div(2)
          const accFees = new BigNumber(Math.pow(collateral["stabilityFee"], secondsBetweenDates) - 1)
          dailyFee = dailyFee.plus(avgDebt.multipliedBy(accFees))
        }
      }

      return {
        timestamp,
        totalFees: "0",
        dailyFees: dailyFee.toString(),
        totalRevenue: "0",
        dailyRevenue: dailyFee.toString(),
      };
    };
  };
};


const adapter: Adapter = {
  fees: {
    [ETHEREUM]: {
        fetch: graphs(endpoints)(ETHEREUM),
        start: async ()  => 1573672933,
    },
  }
}

export default adapter;
