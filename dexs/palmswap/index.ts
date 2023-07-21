import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

import BigNumber from "bignumber.js";
const { request, gql } = require("graphql-request");

const info: { [key: string]: any } = {
  bsc: {
    subgraph:
      "https://api.thegraph.com/subgraphs/name/palmswap/synthetic-stats-mainnet",
  },
};

// Define a simple version of getUniqStartOfTodayTimestamp
function getUniqStartOfTodayTimestamp(now: Date) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const startOfDay = new Date(Date.UTC(year, month, day));
  return startOfDay.getTime() / 1000;
}

const fetchVolume = () => {
  return async (timestamp: number) => {
    const totdayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );

    const graphQLTotal = `
      {
        volumeStats(
          orderBy: "id"
          orderDirection: desc
          first: 1
          where: { period: total }
        ) {
          margin
          liquidation
        }
      }
    `;

    const graphQlDaily = `
      {
        volumeStats(
          orderBy: "id"
          orderDirection: desc
          first: 1
          where: { period: daily }
        ) {
          id
          margin
          liquidation
        }
      }
    `;

    // Fetch total volume data
    const dataTotal = await request(info.bsc.subgraph, graphQLTotal);

    // Fetch daily volume data
    const dataDaily = await request(info.bsc.subgraph, graphQlDaily);

    // Process the fetched data and compute the response

    const totalVolume = new BigNumber(dataTotal.volumeStats[0]?.margin || 0);
    const dailyVolume = new BigNumber(dataDaily.volumeStats[0]?.margin || 0);

    return {
      totalVolume: totalVolume.toString(),
      dailyVolume: dailyVolume.toString(),
      timestamp: totdayTimestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume(),
      start: async () => {
        const now = new Date();
        return getUniqStartOfTodayTimestamp(now);
      },
    },
  },
};

export default adapter;
