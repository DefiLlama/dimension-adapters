// SynFutures v1 volume
import { Adapter, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import axios from "axios";
import { Chain } from '@defillama/sdk/build/general';
import customBackfill from "../../helpers/customBackfill";
import { getPrices } from "../../utils/prices";
const { request, gql } = require("graphql-request");

const info: {[key: string]: any} = {
  polygon: {
    subgraph: 'https://api.thegraph.com/subgraphs/name/synfutures/polygon-v1',
  },
  ethereum: {
    subgraph: 'https://api.thegraph.com/subgraphs/name/synfutures/ethereum-v1',
  },
  bsc: {
    subgraph: 'https://api.thegraph.com/subgraphs/name/synfutures/bsc-v1',
  },
  arbitrum: {
    subgraph: 'https://api.thegraph.com/subgraphs/name/synfutures/arbitrum-one-v1',
  },
}

interface DailyVolume {
  timestamp: number;
  quoteAddr: string;
  volume: number;
}

export function dayIdFromTimestamp(timestamp: number): number {
  return Math.floor(timestamp / 86400);
}

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const totdayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const endDayId = dayIdFromTimestamp(totdayTimestamp);
  
    const graphQL = `{
      quoteDataDailySnapshots(first: 1000, where: {dayId: ${endDayId}}) {
        id
        dayId
        quote{
          id
          symbol
        }
        dayTradeVolume
      }
    }`;

    const data = await request(info[chain].subgraph, graphQL);

    let sum = 0;
    for (const dailyData of data.quoteDataDailySnapshots) {
      const tokenId = chain+':'+dailyData.quote.id;
      const prices = await getPrices([tokenId], totdayTimestamp);
      sum += Number(dailyData.dayTradeVolume) / 10 ** 18 * prices[tokenId].price;
    }

    return {
      totalVolume: undefined,
      dailyVolume: `${sum}`,
      timestamp: totdayTimestamp,
    };
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: 1628128417,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1659750817,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: 1628128417,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: 1628128417,
    },    
  },
};

export default adapter;


