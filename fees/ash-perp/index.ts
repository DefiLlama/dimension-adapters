import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import request from "graphql-request";

const API_URL = 'https://statistic-api.ashperp.trade/graphql';

interface IFee {
  time: string;
  v2_fees: number;
  total_fees: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const startTs = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const endTs = startTs + 86400;
    const feeQuery =`query Trading {
      trading {
        getDailyFee(from: ${startTs}, to: ${endTs}){
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
      dailyRevenue: `${dailyRevenue}`,
      dailyHoldersRevenue: `${dailyFee.trading.getDailyFee.daily_holders_revenue}`,
      dailyProtocolRevenue: `${dailyFee.trading.getDailyFee.daily_protocol_revenue}`,
      timestamp,
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1706745600,
      runAtCurrTime: true,
    }
  },
  isExpensiveAdapter: true,
};
export default adapter;
