import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
const { request, gql } = require("graphql-request");

const info: { [key: string]: any } = {
  [CHAIN.ERA]: {
    subgraph:
      "https://api.studio.thegraph.com/query/49271/zkswap_finance/0.0.2",
  },
};

const getData = async (chain: string, timestamp: number) => {
  const starDaytTimestamp = getUniqStartOfTodayTimestamp(
    new Date(1684842780 * 1000)
  );
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
      pairDayDatas(
          first: 1000
          where: {date_gt: ${starDaytTimestamp}}
        ) {
          token0 {
            id
          }
          token1 {
            id
          }
          dailyVolumeToken0
          dailyVolumeToken1
          date
        }
      }`;

    const data = await request(info[chain].subgraph, graphQL);
    returnCount = data.pairDayDatas.length;
    step++;

    let token0rray = [] as string[];
    for (const dailyData of data.pairDayDatas) {
      token0rray.push(chain + ":" + dailyData.token0.id);
      token0rray.push(chain + ":" + dailyData.token1.id);
    }
    let unique = [...new Set(token0rray)] as string[];
    const prices = await getPrices(unique, todayTimestamp);

    for (const dailyData of data.pairDayDatas) {
      const token0Id = chain + ":" + dailyData.token0.id;
      const token1Id = chain + ":" + dailyData.token1.id;
      let aPrice = prices[token0Id] === undefined ? 0 : prices[token0Id].price;
      let bPrice = prices[token1Id] === undefined ? 0 : prices[token1Id].price;
      if(dailyData.date > todayTimestamp){
        daySum += Number(dailyData.dailyVolumeToken0) * aPrice;
        daySum += Number(dailyData.dailyVolumeToken1) * bPrice;
      }

      totalSum += Number(dailyData.dailyVolumeToken0) * aPrice;
      totalSum += Number(dailyData.dailyVolumeToken1) * bPrice;
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
