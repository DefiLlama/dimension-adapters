import { Adapter } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getBlock } from "../helpers/getBlock";
import { ChainBlocks } from "../adapters/types";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/protofire/maker-protocol"
}

// Source: https://makerburn.com/#/rundown
const collateralYields = {
  "RWA007-A": 4,
  "RWA009-A": 0.11,
  "RWA010-A": 4,
  "RWA011-A": 4,
  "RWA014-A": 2.6,
  "RWA015-A": 4.5,
  "PSM-GUSD-A": 2,
} as {
  [rwa:string]:number
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
          let accFees = new BigNumber(Math.pow(collateral["stabilityFee"], secondsBetweenDates) - 1)
          if(collateralYields[collateral.id]){
            accFees = new BigNumber(collateralYields[collateral.id]/365e2)
          }
          dailyFee = dailyFee.plus(avgDebt.multipliedBy(accFees))
        }
      }

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyFee.toString(),
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
        fetch: graphs(endpoints)(ETHEREUM),
        start: async ()  => 1573672933,
    },
  }
}

export default adapter;
