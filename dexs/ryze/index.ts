import * as sdk from "@defillama/sdk";
import { ChainEndpoints, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import request, { gql } from "graphql-request";
import { getBlock } from "../../helpers/getBlock";

const endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('3MwM7j7s5EMrXE3uA5WUKU9GR4pfegirg4tSWTVMLwTK'),
};

interface IPoolSnapshot {
  totalVolumes: {
    volume: string;
    volumeOfReverted: string;
  }[];
  daySnapshots: {
    volume: string;
  }[];
}

const formatDate = (timestamp: number) => {
  var d = new Date(timestamp * 1000),
    month = '' + (d.getMonth() + 1),
    day = '' + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2)
    month = '0' + month;
  if (day.length < 2)
    day = '0' + day;

  return [year, month, day].join('-');
}

const v2Graphs = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const toTimestamp = dayTimestamp
    const toBlock = (await getBlock(toTimestamp, chain, {}));

    const graphQuery = gql
      `query volumes {
      totalVolumes(block: {number: ${toBlock - 1}}) {
        volume
        volumeOfReverted
      }
      daySnapshots(where: {date: "${formatDate(toTimestamp)}"}) {
        volume
      }
    }`;

    const graphRes: IPoolSnapshot = (await request(endpoints[chain], graphQuery));
    const dailyVolume = graphRes.daySnapshots.length == 0 ? 0 : Number(graphRes.daySnapshots[0].volume);

    return {
      dailyVolume: dailyVolume,
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
        start: '2023-07-21',
      }
    }
  }, {})
};

export default adapter;
