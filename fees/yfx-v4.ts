import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://graph-v4.yfx.com/yfx_v4",
  [CHAIN.BASE]: "https://graph-v4.yfx.com/yfx_v4_base",
}

const methodology = {
  Fees: "Fees from open/close position (0.05%) and remove liquidity fees (0%)",
  UserFees: "Fees from open/close position (0.05%)",
}

const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  const graphUrl = endpoints[chain];
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);

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


  const marketFees = await request(graphUrl, marketData);
  const poolFees = await request(graphUrl, poolData);

  let swapFee = 0
  let liquidityFee = 0
  for (let i in marketFees.marketInfoDailies) {
    swapFee += parseFloat(marketFees.marketInfoDailies[i].totalFeeUSD);
  }

  for (let i in poolFees.poolDataDailyDatas) {
    liquidityFee += parseFloat(poolFees.poolDataDailyDatas[i].removeLiquidityFeeUSD)
  }

  return {
    dailyFees: (swapFee + liquidityFee).toString(),
    dailyUserFees: swapFee.toString(),
  };
};


const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: '2024-04-24',
    },
    [CHAIN.BASE]: {
      start: '2024-07-15',
    },
  },
  methodology,
}

export default adapter;
