import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import {
  formatTimestampAsDate, getTimestampAtStartOfPreviousDayUTC
} from "../../utils/date";
import { getPrices } from "../../utils/prices";

const endpoints = {
  [ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/predy-dev/predyv3arbitrum",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      // ETH oracle price
      const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
      const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress]
        .price;

      // Set date string parmas which are used by queryies
      const todaysDateParts = formatTimestampAsDate(timestamp.toString()).split(
        "/"
      );
      const todaysDateString = `${todaysDateParts[2]}-${todaysDateParts[1]}-${todaysDateParts[0]}`;

      const previousDateUTC = getTimestampAtStartOfPreviousDayUTC(timestamp);
      const previousDateParts = formatTimestampAsDate(
        previousDateUTC.toString()
      ).split("/");
      const previousDateString = `${previousDateParts[2]}-${previousDateParts[1]}-${previousDateParts[0]}`;

      /* Set daily fees */

      // Get daily LPT and token revenue
      let query;
      query = gql`
      {
          lprevenueDaily(id: "${todaysDateString}") {
            id
            fee0
            fee1
            premiumSupply
            premiumBorrow
            supplyInterest0
            supplyInterest1
            borrowInterest0
            borrowInterest1
            updatedAt
          }
      }
      `;
      const result = await request(graphUrls[chain], query);

      // Set LPT revenue
      const fee0 = new BigNumber(result.lprevenueDaily.fee0)
        .times(ethPrice)
        .div(1e12);
      const fee1 = new BigNumber(result.lprevenueDaily.fee1);
      const premiumSupply = new BigNumber(result.lprevenueDaily.premiumSupply);
      const lptRevenue = fee0.plus(fee1).plus(premiumSupply).div(1e6);

      // Set token revenue
      const supplyInterest0 = new BigNumber(
        result.lprevenueDaily.supplyInterest0
      )
        .times(ethPrice)
        .div(1e12);
      const supplyInterest1 = new BigNumber(
        result.lprevenueDaily.supplyInterest1
      );
      const tokenRevenue = supplyInterest0.plus(supplyInterest1).div(1e6);

      const dailyFees = lptRevenue.plus(tokenRevenue);

      /* Set daily revenue */

      // Get accumulatedProtocolFees for today and previous day
      query = gql`
      {
          accumulatedProtocolFeeDaily(id: "${todaysDateString}") {
              accumulatedProtocolFee0
              accumulatedProtocolFee1
          }
      }
      `;
      const todayResults = await request(graphUrls[chain], query);

      query = gql`
      {
          accumulatedProtocolFeeDaily(id: "${previousDateString}") {
              accumulatedProtocolFee0
              accumulatedProtocolFee1
          }
      }
      `;
      const previousDayResults = await request(graphUrls[chain], query);

      const dailyFee0 = new BigNumber(
        todayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee0 -
          previousDayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee0
      )
        .times(ethPrice)
        .div(1e12);
      const dailyFee1 = new BigNumber(
        todayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee1 -
          previousDayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee1
      );

      const dailyRevenue = dailyFee0.plus(dailyFee1).div(1e6);

      return {
        timestamp,
        dailyFees: dailyFees.toString(),
        dailyRevenue: dailyRevenue.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ARBITRUM]: {
      fetch: graphs(endpoints)(ARBITRUM),
      start: async () => 1671092333,
    },
  },
};

export default adapter;
