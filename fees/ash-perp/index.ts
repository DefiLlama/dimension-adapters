import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import request from "graphql-request";

const API_URL = 'https://statistic-api.ashperp.trade/graphql';

const fetch = async ({ endTimestamp, startTimestamp, createBalances }: FetchOptions) => {
    const feeQuery =`query Trading {
      trading {
        getDailyFee(from: ${startTimestamp}, to: ${endTimestamp}){
          daily_fees
          daily_holders_revenue
          daily_protocol_revenue
        }
      }
    }`;

    const df = (await request(API_URL, feeQuery));
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    const dailyHoldersRevenue = createBalances();
    const dailyProtocolRevenue = createBalances();

    dailyFees.addUSDValue(df.trading.getDailyFee.daily_fees, METRIC.TRADING_FEES);
    dailyHoldersRevenue.addUSDValue(df.trading.getDailyFee.daily_holders_revenue, METRIC.STAKING_REWARDS);
    dailyProtocolRevenue.addUSDValue(df.trading.getDailyFee.daily_protocol_revenue, METRIC.PROTOCOL_FEES);
    dailyRevenue.addBalances(dailyHoldersRevenue);
    dailyRevenue.addBalances(dailyProtocolRevenue);

    // const dailyRevenue = Number(dailyFee.trading.getDailyFee.daily_holders_revenue) + Number(dailyFee.trading.getDailyFee.daily_protocol_revenue);

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailyProtocolRevenue,
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
    [METRIC.STAKING_REWARDS]: "Portion of trading fees distributed to ASH token holders"
  }
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.ELROND],
  fetch,
  start: '2024-02-01',
  methodology,
  breakdownMethodology,
  deadFrom: '2025-10-01',
};
export default adapter;
