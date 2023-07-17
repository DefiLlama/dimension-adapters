//  Maverick v1 data
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
const { request, gql } = require("graphql-request");

const info: { [key: string]: any } = {
  [CHAIN.ERA]: {
    subgraph: "https://api.studio.thegraph.com/query/49147/derpdex-v3-amm/v0.0.6",
  },
};

const getData = async (chain: string, timestamp: number) => {
  const todayTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );

  let returnCount = 1000;
  let daySum = 0;
  let totalSum = 0;
  let dayFee = 0;
  let totalFee = 0;
  let step = 0;
  while (returnCount == 1000) {
      const graphQL = `{
        poolDayDatas(
          orderBy: date
          orderDirection: desc
          first: 1000
          skip: ${step * 1000}
          where: {date: ${todayTimestamp}}
        ) {
          id
          pool {
            id
            token0 {
              id
              volume
            }
            token1 {
              id
              volume
            }
            volumeUSD
            feesUSD
          }
          volumeUSD
          feesUSD
          date
        }
      }`;

      const data = await request(info[chain].subgraph, graphQL);
      returnCount = data.poolDayDatas.length;
      step++;  

      for (const dailyData of data.poolDayDatas) {
        daySum += Number(dailyData.volumeUSD)
        dayFee += Number(dailyData.pool.feesUSD);
  
        totalSum += Number(dailyData.pool.volumeUSD);
        totalFee += Number(dailyData.feesUSD);
      }
    }

  return {
    dailyFees: `${dayFee}`,
    totalFees: `${totalFee}`,
    dailyUserFees: `${dayFee}`,
    totalUserFees: `${totalFee}`,
    totalVolume: `${totalSum}`,
    dailyVolume: `${daySum}`,
    timestamp: todayTimestamp,
  };
};

export const fetchVolume = (chain: string) => {
  return async (timestamp: number) => {
    const data = await getData(chain, timestamp);

    return {
      totalVolume: data.totalVolume,
      dailyVolume: data.dailyVolume,
      timestamp: data.timestamp,
    };
  };
};

export const fetchFee = (chain: string) => {
  return async (timestamp: number) => {
    const data = await getData(chain, timestamp);

    return {
      timestamp,
      dailyFees: data.dailyFees,
      totalFees: data.totalFees,
      dailyUserFees: data.dailyUserFees,
      totalUserFees: data.totalUserFees,
    };
  };
};