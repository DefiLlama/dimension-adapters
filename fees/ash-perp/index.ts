import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
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

const methodology = {
  Fees: "Trading fees paid by users on perpetual positions",
  Revenue: "Portion of trading fees retained by protocol treasury and distributed to token holders"
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "All trading fees collected from perpetual trading positions on the platform"
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Portion of trading fees allocated to the protocol treasury"
  },
  HoldersRevenue: {
    "Token holder distributions": "Portion of trading fees distributed to ASH token holders"
  }
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ELROND]: {
      fetch,
      start: '2024-02-01',
    }
  },
  methodology,
  breakdownMethodology,
};
export default adapter;
