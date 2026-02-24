import * as sdk from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { BaseAdapter, ChainEndpoints, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints: ChainEndpoints = {
  [CHAIN.XDAI]: sdk.graph.modifyEndpoint('9kdgh1tW36E8MKthUmZ2FJbe2KCuvkibz984SxbQSdJw'),
  [CHAIN.CELO]: sdk.graph.modifyEndpoint('2iS1nCtSKbJT7MZ2xH9hMej3CjJDRRGuv25cAt6kbEwj'),
  [CHAIN.TELOS]: 'https://api.goldsky.com/api/public/project_clnbo3e3c16lj33xva5r2aqk7/subgraphs/symmetric-telos/prod/gn',

};

interface IPool {
  id: string;
  swapVolume: string;
}
interface IPoolSnapshot {
  today: IPool[];
  yesterday: IPool[];
}


const v2Graphs = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const startTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const fromTimestamp = startTimestamp - 60 * 60 * 24
    const toTimestamp = startTimestamp
    const graphQuery = gql
      `query fees {
        today:poolSnapshots(where: {timestamp:${toTimestamp}, protocolFee_gt:0}, orderBy:swapFees, orderDirection: desc) {
          id
          swapVolume
        }
        yesterday:poolSnapshots(where: {timestamp:${fromTimestamp}, protocolFee_gt:0}, orderBy:swapFees, orderDirection: desc) {
          id
          swapVolume
        }
      }`;
    // const blackList = ['0x93d199263632a4ef4bb438f1feb99e57b4b5f0bd0000000000000000000005c2']
    const graphRes: IPoolSnapshot = (await request(endpoints[chain], graphQuery));
    const dailyVolume = graphRes["today"].map((p: IPool) => {
      const yesterdayValue = Number(graphRes.yesterday.find((e: IPool) => e.id.split('-')[0] === p.id.split('-')[0])?.swapVolume || '0')
      if (yesterdayValue === 0) return 0;
      return Number(p.swapVolume) - yesterdayValue;
    }).filter(e => e < 100_000_000).reduce((a: number, b: number) => a + b, 0)

    return {
      dailyVolume: dailyVolume,
      timestamp,
    };
  };
};

type TTime = {
  [s: string]: number;
}
const startTimes: TTime = {
  [CHAIN.XDAI]: 1655251200,
  [CHAIN.CELO]: 1654560000,
  [CHAIN.TELOS]: 1699920000,
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: v2Graphs(chain),
        start: startTimes[chain],
      }
    }
  }, {} as BaseAdapter)
}

export default adapter;
