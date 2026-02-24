import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from  "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://graph-v4.yfx.com/yfx_v4",
  [CHAIN.BASE]: "https://graph-v4.yfx.com/yfx_v4_base",
}

const methodology = {
  Fees: "Fees from open/close position (0.05%) and remove liquidity fees (0%)",
  UserFees: "Fees from open/close position (0.05%)",
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: any) => {
      const time = timestamp.toTimestamp;
      const todaysTimestamp = getTimestampAtStartOfDayUTC(time)

      const marketData = gql`
      {
        marketInfoDailies(where: {dayTime: "${todaysTimestamp}"}) {
          totalFeeUSD
          totalCommissionUSD
          totalDiscountUSD
        }
      }`
      const poolData = gql`
        {
          poolDailyDatas(where: {dayTime: "${todaysTimestamp}"}) {
            removeLiquidityFeeUSD
          }
        }
      `


      const marketFees = await request(graphUrls[chain], marketData);
      const poolFees = await request(graphUrls[chain], poolData);

      let swapFee = 0
      let liquidityFee = 0
      for (let i in marketFees.marketInfoDailies) {
        swapFee += parseFloat(marketFees.marketInfoDailies[i].totalFeeUSD);
      }

      for (let i in poolFees.poolDataDailyDatas) {
        liquidityFee += parseFloat(poolFees.poolDataDailyDatas[i].removeLiquidityFeeUSD) 
      }
      
      return {
        time: time.toString(),
        dailyFees: (swapFee+liquidityFee).toString(),
        dailyUserFees: swapFee.toString(),
      };
    };
  };
};


const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: '2024-04-24',
    },
    [CHAIN.BASE]: {
      fetch: graphs(endpoints)(CHAIN.BASE),
      start: '2024-07-15',
    },
  }
}

export default adapter;
