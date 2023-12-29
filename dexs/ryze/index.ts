import { ChainEndpoints, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import request, { gql } from "graphql-request";
import { getBlock } from "../../helpers/getBlock";

const endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/chinu-dev/ryze-dashboard-subgraph-prod",
};

interface IPool {
  volume: string;
  volumeOfReverted: string;
}

interface IPoolSnapshot {
  today: IPool[];
  yesterday: IPool[];
}

const v2Graphs = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const fromTimestamp = dayTimestamp - 60 * 60 * 24
    const toTimestamp = dayTimestamp
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));

    const graphQuery = gql
      `query volumes {
      today:totalVolumes(block: {number: ${toBlock}}) {
        volume
        volumeOfReverted
      }
      yesterday:totalVolumes(block: {number: ${fromBlock}}) {
        volume
        volumeOfReverted
      }
    }`;

    const graphRes: IPoolSnapshot = (await request(endpoints[chain], graphQuery));
    const totalVolume = graphRes.today.length == 0 ? 0 : Number(graphRes.today[0].volume) - Number(graphRes.today[0].volumeOfReverted);
    const yesterdayTotalVolume = graphRes.yesterday.length == 0 ? 0 : Number(graphRes.yesterday[0].volume) - Number(graphRes.yesterday[0].volumeOfReverted);
    const dailyVolume = totalVolume - yesterdayTotalVolume;

    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: `${dailyVolume}`,
      timestamp: dayTimestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: v2Graphs(chain),
        start: async () => 1689974616,
      }
    }
  }, {})
};

export default adapter;
