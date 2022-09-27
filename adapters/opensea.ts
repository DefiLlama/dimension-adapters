import { FeeAdapter } from "../utils/adapters.type";
import {ETHEREUM } from "../helpers/chains";
import { IGraphUrls } from "../helpers/graphs.type";
import { Chain } from "../utils/constants";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { request, gql } from "graphql-request";
import { getPrices } from "../utils/prices";
import BigNumber from "bignumber.js";

const v1Endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/opensea-v1-ethereum",
}

const v2Endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/opensea-v2-ethereum",
};

const seaportEndpoints = {
  [ETHEREUM]: 'https://api.thegraph.com/subgraphs/name/messari/opensea-seaport-ethereum',
}

const graphs = (graphUrls: IGraphUrls) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const dateId = Math.floor(todaysTimestamp / 86400);

      const graphQuery = gql
      `{
        marketplaceDailySnapshot(id: ${dateId}) {
          totalRevenueETH
          marketplaceRevenueETH
        }
      }`;
      const ethAddress = "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
      const pricesObj: any = await getPrices([ethAddress], todaysTimestamp);
      console.log(pricesObj)
      const latestPrice = new BigNumber(pricesObj[ethAddress]["price"])
      console.log(latestPrice)

      const graphRes = await request(graphUrls[chain], graphQuery);
      const dailyFee = new BigNumber(graphRes.totalRevenueETH).multipliedBy(latestPrice)
      const dailyRev = new BigNumber(graphRes.marketplaceRevenueETH).multipliedBy(latestPrice)
      console.log(dailyFee.toString())
      
      return {
        timestamp,
        totalFees: "0",
        dailyFees: dailyFee.toString(),
        totalRevenue: "0",
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};

const adapter: FeeAdapter = {
  breakdown: {
    v1: {
      [ETHEREUM]: {
        fetch: graphs(v1Endpoints)(ETHEREUM),
        start: 1528911384
      },
    },
    v2: {
      [ETHEREUM]: {
        fetch: graphs(v2Endpoints)(ETHEREUM),
        start: 1645228794
      },
    },
    seaport: {
      [ETHEREUM]: {
        fetch: graphs(seaportEndpoints)(ETHEREUM),
        start: 1655055510
      },
    }
  }
}

export default adapter;
