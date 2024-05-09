import { ChainEndpoints, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import request, { gql } from "graphql-request";

const endpoints: ChainEndpoints = {
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/beethovenxfi/beethovenx",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/beethovenxfi/beethovenx-optimism",
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
      today:poolSnapshots(where: {timestamp:${toTimestamp}}) {
        id
        swapVolume
      }
      yesterday:poolSnapshots(where: {timestamp:${fromTimestamp}}) {
        id
        swapVolume
      }
    }`;

    const graphRes: IPoolSnapshot = (await request(endpoints[chain], graphQuery));
    const dailyVolume = graphRes["today"].map((p: IPool) => {
      const yesterdayValue = Number(graphRes.yesterday.find((e: IPool) => e.id.split('-')[0] === p.id.split('-')[0])?.swapVolume || '0')
      if (yesterdayValue === 0) return 0;
      return Number(p.swapVolume) - yesterdayValue;
    }).filter(e => e < 100_000_000).reduce((a: number, b: number) => a + b, 0)

    return {
      dailyVolume: `${dailyVolume}`,
      timestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: v2Graphs(chain),
        start: 1633392000,
      }
    }
  }, {})
};

export default adapter;
