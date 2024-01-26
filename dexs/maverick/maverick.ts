//  Maverick v1 data
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
const { request, gql } = require("graphql-request");

const info: { [key: string]: any } = {
  [CHAIN.ETHEREUM]: {
    subgraph: "https://api.thegraph.com/subgraphs/name/maverick-protocol/maverick-mainnet-data",
  },
  [CHAIN.ERA]: {
    subgraph:
      "https://app.zeeve.io/shared-api/subgraph/query/query-node-0/50ad2beaefaac4b1eda15839c3eac8259d0759b7d4ae1002/subgraphs/name/zksync",
  },
  [CHAIN.BSC]: {
    subgraph:
      "https://api.thegraph.com/subgraphs/name/maverick-protocol/maverick-bnb-app",
  },
  [CHAIN.BASE]: {
    subgraph:
      "https://api.studio.thegraph.com/query/42519/maverick-base/version/latest",
  },
};

const getData = async (chain: string, timestamp: number) => {
  const totdayTimestamp = getUniqStartOfTodayTimestamp(
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
        poolDayStats(
          orderBy: id
          orderDirection: desc
          first: 1000
          skip: ${step * 1000}
          where: {timestamp: "${totdayTimestamp}"}
        ) {
          id
          pool {
            id
            tokenB {
              id
            }
            tokenA {
              id
            }
            tokenAVolume
            tokenBVolume
            fee
          }
          tokenAVolume
          tokenBVolume
          timestamp
        }
      }`;

    const data = await request(info[chain].subgraph, graphQL);
    returnCount = data.poolDayStats.length;
    step++;

    let tokenArray = [] as string[];
    for (const dailyData of data.poolDayStats) {
      tokenArray.push(chain + ":" + dailyData.pool.tokenA.id);
      tokenArray.push(chain + ":" + dailyData.pool.tokenB.id);
    }
    let unique = [...new Set(tokenArray)] as string[];
    const prices = await getPrices(unique, totdayTimestamp);

    for (const dailyData of data.poolDayStats) {
      const tokenAId = chain + ":" + dailyData.pool.tokenA.id;
      const tokenBId = chain + ":" + dailyData.pool.tokenB.id;
      let aPrice = prices[tokenAId] === undefined ? 0 : prices[tokenAId].price;
      let bPrice = prices[tokenBId] === undefined ? 0 : prices[tokenBId].price;
      daySum += Number(dailyData.tokenAVolume) * aPrice;
      daySum += Number(dailyData.tokenBVolume) * bPrice;
      dayFee += Number(dailyData.tokenAVolume) * aPrice * dailyData.pool.fee;
      dayFee += Number(dailyData.tokenBVolume) * bPrice * dailyData.pool.fee;

      totalSum += Number(dailyData.pool.tokenAVolume) * aPrice;
      totalSum += Number(dailyData.pool.tokenBVolume) * bPrice;
      totalFee +=
        Number(dailyData.pool.tokenAVolume) * aPrice * dailyData.pool.fee;
      totalFee +=
        Number(dailyData.pool.tokenBVolume) * bPrice * dailyData.pool.fee;
    }
  }

  return {
    dailyFees: `${dayFee}`,
    totalFees: `${totalFee}`,
    dailyUserFees: `${dayFee}`,
    totalUserFees: `${totalFee}`,
    totalVolume: `${totalSum}`,
    dailyVolume: `${daySum}`,
    timestamp: totdayTimestamp,
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
