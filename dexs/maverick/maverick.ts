import { CHAIN } from "../../helpers/chains";
import { ChainBlocks, FetchOptions } from "../../adapters/types";
const { request, } = require("graphql-request");

const info: { [key: string]: any } = {
  [CHAIN.ETHEREUM]: {
    subgraph: "https://api.thegraph.com/subgraphs/name/maverick-protocol/maverick-mainnet-data",
  },
  [CHAIN.ERA]: {
    subgraph:
      "https://api.studio.thegraph.com/query/36330/mav-zksync/version/latest",
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

const getData = async ({ chain, createBalances, startOfDay }: FetchOptions) => {
  const dailyFees = createBalances();
  const totalFees = createBalances();
  const dailyUserFees = createBalances();
  const totalUserFees = createBalances();
  const dailyVolume = createBalances();
  const totalVolume = createBalances();

  let returnCount = 1000;
  let step = 0;
  while (returnCount == 1000) {
    const graphQL = `{
        poolDayStats(
          orderBy: id
          orderDirection: desc
          first: 1000
          skip: ${step * 1000}
          where: {timestamp: "${startOfDay}"}
        ) {
          id
          pool {
            id
            tokenB {
              id
              decimals
            }
            tokenA {
              id
              decimals
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

    for (const dailyData of data.poolDayStats) {
      const tokenAId = dailyData.pool.tokenA.id;
      const tokenBId = dailyData.pool.tokenB.id;
      const multiplierA = 10 ** dailyData.pool.tokenA.decimals;
      const multiplierB = 10 ** dailyData.pool.tokenB.decimals;
      dailyVolume.add(tokenAId, dailyData.tokenAVolume * multiplierA);
      dailyVolume.add(tokenBId, dailyData.tokenBVolume * multiplierB);
      dailyFees.add(tokenAId, dailyData.tokenAVolume * multiplierA * dailyData.pool.fee);
      dailyFees.add(tokenBId, dailyData.tokenBVolume * multiplierB * dailyData.pool.fee);

      totalVolume.add(tokenAId, dailyData.pool.tokenAVolume * multiplierA);
      totalVolume.add(tokenBId, dailyData.pool.tokenBVolume * multiplierB);
      totalFees.add(tokenAId, dailyData.pool.tokenAVolume * multiplierA * dailyData.pool.fee);
      totalFees.add(tokenBId, dailyData.pool.tokenBVolume * multiplierB * dailyData.pool.fee);
    }
  }

  return {
    dailyFees,
    totalFees,
    dailyUserFees: dailyFees,
    totalUserFees: totalFees,
    totalVolume,
    dailyVolume,
    timestamp: startOfDay,
  };
};

export const fetchVolume = (_chain: string) => {
  return async (_timestamp: number, _: ChainBlocks, options: FetchOptions) => {
    const data = await getData(options);

    return {
      // totalVolume: data.totalVolume,
      dailyVolume: data.dailyVolume,
      timestamp: data.timestamp,
    };
  };
};

export const fetchFee = (_chain: string) => {
  return async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
    const data = await getData(options);

    return {
      timestamp,
      dailyFees: data.dailyFees,
      // totalFees: data.totalFees,
      dailyUserFees: data.dailyUserFees,
      // totalUserFees: data.totalUserFees,
    };
  };
};
