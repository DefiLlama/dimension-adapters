import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
const { request, gql } = require("graphql-request");

const info: { [key: string]: any } = {
  [CHAIN.ERA]: {
    subgraph:
      "https://api.studio.thegraph.com/query/49271/zkswap_finance/0.0.5",
  },
};

const getData = async (chain: string, timestamp: number) => {

  const starDexDaytTimestamp = getUniqStartOfTodayTimestamp(
    new Date(1684842780 * 1000)
  );
  const startDayTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );

  let dayMiliseconds = 24 * 60 * 60
  let returnCount = 1000;
  let daySum = 0;
  let totalSum = 0;
  let step = 0;

  const graphQLTotalVolume = `{
    pairs(first: 1000) {
      volumeToken0
      token0 {
        id
      }
    }
  }`;

  const data = await request(info[chain].subgraph, graphQLTotalVolume);


  let token0rray = [] as string[];
  for (const pair of data.pairs) {
    token0rray.push(chain + ":" + pair.token0.id);
  }
  let unique = [...new Set(token0rray)] as string[];
  const prices = await getPrices(unique, startDayTimestamp);


  for (const pair of data.pairs) {
    const token0Id = chain + ":" + pair.token0.id;
    let price0 = prices[token0Id] === undefined ? 0 : prices[token0Id].price;

    totalSum += Number(pair.volumeToken0) * price0
  }

  let lasTimestampQuery = startDayTimestamp

  while (returnCount == 1000) {
    const graphQL = `{
      swaps(
        orderBy: timestamp
        orderDirection: asc
        first: 1000
        where: {timestamp_gte: ${lasTimestampQuery}, timestamp_lt: ${startDayTimestamp + dayMiliseconds} }
        ) {
          amount0In
          amount0Out
          timestamp
          pair {
            token0 {
              id
            }
          }
        }
      }`;

    const data = await request(info[chain].subgraph, graphQL);
    returnCount = data.swaps.length;
    lasTimestampQuery = data?.swaps[returnCount-1]?.timestamp

    for (const swap of data.swaps) {

      const token0Id = chain + ":" + swap.pair.token0.id;
      let price0 = prices[token0Id] === undefined ? 0 : prices[token0Id].price;

      daySum += Number(swap.amount0In) * price0;
      daySum += Number(swap.amount0Out) * price0;
    }
  }

  return {
    totalVolume: `${totalSum}`,
    dailyVolume: `${daySum}`,
    timestamp: startDayTimestamp,
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