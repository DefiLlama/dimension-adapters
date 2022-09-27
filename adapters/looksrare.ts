import { FeeAdapter } from "../utils/adapters.type";
import { ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { IGraphUrls } from "../helpers/graphs.type";
import { Chain } from "../utils/constants";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import BigNumber from "bignumber.js";

const endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/looksrare-ethereum",
}

const graphs = (graphUrls: IGraphUrls) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)
      const dateId = Math.floor(todaysTimestamp / 86400);
      const yesDateId = Math.floor(yesterdaysTimestamp / 86400);

      const graphQuery = gql
      `{
        today: marketplaceDailySnapshot(id: ${dateId}) {
          totalRevenueETH
          marketplaceRevenueETH
        },
        yesterday: marketplaceDailySnapshot(id: ${yesDateId}) {
          totalRevenueETH
          marketplaceRevenueETH
        }
      }`;
      const ethAddress = "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
      const pricesObj: any = await getPrices([ethAddress], todaysTimestamp);
      const latestPrice = new BigNumber(pricesObj[ethAddress]["price"])

      const graphRes = await request(graphUrls[chain], graphQuery);
      const dailyFee = new BigNumber(graphRes.today.totalRevenueETH).minus(new BigNumber(graphRes.yesterday.totalRevenueETH)).multipliedBy(latestPrice)
      const dailyRev = new BigNumber(graphRes.today.marketplaceRevenueETH).minus(new BigNumber(graphRes.yesterday.marketplaceRevenueETH)).multipliedBy(latestPrice)

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
  fees: {
    [ETHEREUM]: {
        fetch: graphs(endpoints)(ETHEREUM),
        start: 1640775864,
    },
  }
}

export default adapter;
