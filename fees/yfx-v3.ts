import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from  "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const KEY = '1079471f4ef05e4e9637de21d4bb7c6a'

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://gateway-arbitrum.network.thegraph.com/api/"+KEY+"/subgraphs/id/wTKJtDwtthHZDpp79HbHuegwJRqisjevFDsRtAiSShe"
}

const methodology = {
  Fees: "Fees from open/close position (0.08%) and remove liquidity fees (0.1%)",
  UserFees: "Fees from open/close position (0.08%)",
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)

      const marketData = gql`
      {
        marketInfoDailies(where: {dayTime: "${todaysTimestamp}"}) {
          totalFee
          totalCommission
          totalDiscount
        }
      }`
      const poolData = gql`
        {
          poolDataDailyDatas(where: {dayTime: "${todaysTimestamp}"}) {
            removeLiquidityFee
          }
        }
      `
      const marketFees = await request(graphUrls[chain], marketData);
      const poolFees = await request(graphUrls[chain], poolData);

      let swapFee = 0
      let liquidityFee = 0
      for (let i in marketFees.marketInfoDailies) {
        swapFee += parseFloat(marketFees.marketInfoDailies[i].totalFee) - 
            parseFloat(marketFees.marketInfoDailies[i].totalCommission) - 
            parseFloat(marketFees.marketInfoDailies[i].totalDiscount)
      }

      for (let i in poolFees.poolDataDailyDatas) {
        liquidityFee += parseFloat(poolFees.poolDataDailyDatas[i].removeLiquidityFee) 
      }

      return {
        timestamp,
        dailyFees: (swapFee+liquidityFee).toString(),
        dailyUserFees: swapFee.toString(),
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: '2023-08-04',
    },
  },
  methodology,
}

export default adapter;
