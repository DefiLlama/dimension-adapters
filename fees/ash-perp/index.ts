import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request from "graphql-request";

const API_URL = 'https://statistic-api.ashperp.trade/graphql';

const fetch = async ({ endTimestamp, startTimestamp}: FetchOptions) => {
    const feeQuery =`query Trading {
      trading {
        getDailyFee(from: ${startTimestamp}, to: ${endTimestamp}){
          daily_fees
          daily_holders_revenue
          daily_protocol_revenue
        }
      }
    }`;

    const dailyFee = (await request(API_URL, feeQuery));
    const dailyRevenue = Number(dailyFee.trading.getDailyFee.daily_holders_revenue) + Number(dailyFee.trading.getDailyFee.daily_protocol_revenue);
    return {
      dailyFees: `${dailyFee.trading.getDailyFee.daily_fees}`,
      dailyRevenue,
      dailyHoldersRevenue: `${dailyFee.trading.getDailyFee.daily_holders_revenue}`,
      dailyProtocolRevenue: `${dailyFee.trading.getDailyFee.daily_protocol_revenue}`,
    };
  };

const adapter: Adapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch,
      start: '2024-02-01',
    }
  },
  version: 2
};
export default adapter;
