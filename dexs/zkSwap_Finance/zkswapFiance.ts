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
  const todayTimestamp = getUniqStartOfTodayTimestamp(
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
  const prices = await getPrices(unique, todayTimestamp);


  for (const pair of data.pairs) {
    const token0Id = chain + ":" + pair.token0.id;
    let price0 = prices[token0Id] === undefined ? 0 : prices[token0Id].price;

    totalSum += Number(pair.volumeToken0) * price0
  }


  while (returnCount == 1000) {
    const graphQL = `{
      swaps(
          orderBy: id
          orderDirection: desc
          first: 1000
          skip: ${step * 1000}
          where: {timestamp_gt: ${todayTimestamp - dayMiliseconds}, , timestamp_lt: ${todayTimestamp} }
        ) {
          amount0In
          amount0Out
          pair {
            token0 {
              id
            }
          }
          timestamp
        }
      }`;

    const data = await request(info[chain].subgraph, graphQL);
    returnCount = data.swaps.length;
    step++;


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
