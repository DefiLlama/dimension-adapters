import { ChainEndpoints, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import request, { gql } from "graphql-request";
import { getBlock } from "../../helpers/getBlock";

const endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/chinu-dev/ryze-dashboard-subgraph-prod",
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
    const totalVolume = graphRes.totalVolumes.length == 0 ? 0 : Number(graphRes.totalVolumes[0].volume) - Number(graphRes.totalVolumes[0].volumeOfReverted);
    const dailyVolume = graphRes.daySnapshots.length == 0 ? 0 : Number(graphRes.daySnapshots[0].volume);

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
        start: 1689974616,
      }
    }
  }, {})
};

export default adapter;
