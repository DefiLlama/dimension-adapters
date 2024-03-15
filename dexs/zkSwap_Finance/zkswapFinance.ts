import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { ChainBlocks, FetchOptions } from "../../adapters/types";
const { request, } = require("graphql-request");

const info: { [key: string]: any } = {
  [CHAIN.ERA]: {
    subgraph_v1:
      "https://api.studio.thegraph.com/query/49271/zkswap_finance/0.0.5",
    subgraph_v2: "https://api.studio.thegraph.com/query/49271/zkswap/0.0.9",
  },
};

const getData = async ({ chain, startOfDay, createBalances}: FetchOptions) => {
  const dailyVolume = createBalances()

  let dayMiliseconds = 24 * 60 * 60;
  let returnCount = 1000;

  let fromTimestamp = startOfDay - dayMiliseconds;
  const todaysTimestamp = startOfDay;

  while (returnCount == 1000) {
    const graphQL = `{
      swaps(
        orderBy: timestamp
        orderDirection: asc
        first: 1000
        where: {timestamp_gte: ${fromTimestamp}, timestamp_lt: ${todaysTimestamp} }
        ) {
          amount0In
          amount0Out
          timestamp
          pair {
            token0 {
              id
              decimals
            }
          }
        }
      }`;

    const data = await request(info[chain].subgraph_v1, graphQL);
    returnCount = data.swaps.length;

    fromTimestamp = data?.swaps[returnCount - 1]?.timestamp;

    for (const swap of data.swaps) {
      const token0Id = swap.pair.token0.id;
      const multiplier = Math.pow(10, swap.pair.token0.decimals);
      dailyVolume.add(token0Id, Number(swap.amount0In) * multiplier);
      dailyVolume.add(token0Id, Number(swap.amount0Out) * multiplier);
    }
  }

  return {
    dailyVolume,
    timestamp: startOfDay,
  };
};

const getToDateVolume = async (chain: string, timestamp: number) => {
  const startDayTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );

  let returnCount = 1000;
  let dayMiliseconds = 24 * 60 * 60;
  let volumSum = 0;

  let startTimestampQuery = 0;
  const endDateTimestamp = Number(startDayTimestamp) + dayMiliseconds;

  while (returnCount == 1000) {
    const graphQL = `{
      pancakeDayDatas(
        first: 1000
        orderBy: date
        orderDirection: asc
        where: {date_gt: ${startTimestampQuery}, date_lte: ${endDateTimestamp}}
      ) {
        dailyVolumeUSD
        date
        id
        totalTransactions
        totalVolumeUSD
      }
    }`;

    const data = await request(info[chain].subgraph_v2, graphQL);
    returnCount = data.pancakeDayDatas.length;
    startTimestampQuery = data?.pancakeDayDatas[returnCount - 1]?.date;

    const chunkVolume = data.pancakeDayDatas.reduce((total: number, current: any) => {
      return total + Number(current.dailyVolumeUSD);
    }, 0);

    volumSum += chunkVolume;
  }

  return volumSum;
};

export const fetchVolume = (_chain: string) => {
  return async (_timestamp: number, _: ChainBlocks, options: FetchOptions) => {
    return getData({...options, startOfDay: _timestamp});
    // const totalVolume = await getToDateVolume(options);
  };
};
