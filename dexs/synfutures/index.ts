// SynFutures v1 volume
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from '@defillama/sdk/build/general';
const { request, } = require("graphql-request");

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

export function dayIdFromTimestamp(timestamp: number): number {
  return Math.floor(timestamp / 86400);
}

const fetch = (chain: Chain) => {
  return async (timestamp: number , _: ChainBlocks, { createBalances, startOfDay }: FetchOptions) => {
    const dailyVolume = createBalances()
    const endDayId = dayIdFromTimestamp(startOfDay);
    const graphQL = `{
      quoteDataDailySnapshots(first: 1000, where: {dayId: ${endDayId}}) {
        id
        dayId
        quote{
          id
          symbol
          decimals
        }
        dayTradeVolume
      }
    }`;

    const data = await request(info[chain].subgraph, graphQL);

    for (const dailyData of data.quoteDataDailySnapshots) {
      dailyVolume.add(dailyData.quote.id, Number(dailyData.dayTradeVolume) / (10 ** (18 - Number(dailyData.quote.decimals))));
    }

    return {
      dailyVolume,
      timestamp: startOfDay,
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
