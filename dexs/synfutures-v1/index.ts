import * as sdk from "@defillama/sdk";
// SynFutures v1 volume
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from  "../../adapters/types";
const { request, } = require("graphql-request");

const info: {[key: string]: any} = {
  polygon: {
    subgraph: sdk.graph.modifyEndpoint('AoQ1npLLN7fTJc96XjnL8MgwHAvzxFDuE27kWfdrVATD'),
  },
  ethereum: {
    subgraph: sdk.graph.modifyEndpoint('HLqiPUB5pYH8VztXAcvMW6VTq6avHkW77mYnKe8ov44r'),
  },
  bsc: {
    subgraph: sdk.graph.modifyEndpoint('9AuL6Mga3pzjYDoLEJHncC3rQMCHibaW8syCwJv1QMNW'),
  },
  arbitrum: {
    subgraph: sdk.graph.modifyEndpoint('HktZa8SikfXFpjjGZML578RTrsieQdVENJviucpokLwH'),
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
      start: '2021-08-05',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2022-08-06',
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: '2021-08-05',
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: '2021-08-05',
    },
  },
};

export default adapter;
