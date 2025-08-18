import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { POLYGON, AVAX } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from  "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [POLYGON]: sdk.graph.modifyEndpoint('B8469Fs5athX6XeADT1LUYLKpcupEpWumfRuMbQw6cXs'),
}

let dailyFee= 0;
let finalDailyFee = 0;
let userFee = 0;
let finalUserFee = 0;


const methodology = {
  Fees: "Fees collected from open/close position, liquidations, and borrow fee",
  UserFees: "Fees from open/close position, borrow fee, liquidation fees)",
  HoldersRevenue: "40% of all collected fees goes to COVO stakers",
  SupplySideRevenue: "50% of all collected fees goes to USDC Pool Liquidity providers holders",
  Revenue: "Revenue is 40% of all collected fees, which goes to COVO stakers",
  ProtocolRevenue: "Treasury receives 10% of revenue"
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const searchTimestamp = todaysTimestamp 

      const graphQuery = gql
      `{
        feeStat(id: "${searchTimestamp}") {
         margin
        }
      }`;

      const graphQuery1 = gql
      `  {
        tradingStat(id: "${searchTimestamp}") {
          liquidatedCollateral
        }
      }`;
    
      const graphRes = await request(graphUrls[chain], graphQuery);

      const graphRes1 = await request(graphUrls[chain], graphQuery1);

        if (graphRes.feeStat != null || graphRes1.tradingStat != null) {
      if (graphRes1.tradingStat==null)
          {
           graphRes1.tradingStat.liquidatedCollateral=0; }


      if (graphRes.feeStat==null)
         {
          graphRes.feeStat.margin=0;}

       dailyFee = parseInt(graphRes.feeStat.margin) + parseInt(graphRes1.tradingStat.liquidatedCollateral);
       finalDailyFee = (dailyFee / 1000000);
       userFee = parseInt(graphRes.feeStat.margin) + parseInt(graphRes1.tradingStat.liquidatedCollateral)
       finalUserFee = (userFee / 1000000);

      }

      return {
        timestamp,
        dailyFees: finalDailyFee.toString(),
        dailyUserFees: finalUserFee.toString(),
        dailyRevenue: (finalDailyFee * 0.4).toString(),
        dailyProtocolRevenue: (finalDailyFee * 0.1).toString(),
     //  totalProtocolRevenue: "0",
       totalProtocolRevenue: (finalDailyFee * 0.1).toString(),
        dailyHoldersRevenue: (finalDailyFee * 0.4).toString(),
        dailySupplySideRevenue: (finalDailyFee * 0.5).toString(),
      };
    };
  };
};


const adapter: Adapter = {
  version: 1,
  adapter: {
    [POLYGON]: {
      fetch: graphs(endpoints)(POLYGON),
      start: '2023-03-29',
    },
  },
  methodology
}

export default adapter;
