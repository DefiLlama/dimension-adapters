import request, { gql } from "graphql-request";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const ENDPOINTS = {
  [CHAIN.SONIC]: "https://api.studio.thegraph.com/query/61208/onchain-clob-sonic/version/latest"
}

interface IData {
  volumeUsd: string;
}
interface IGraph {
  dailyVolume: IData;
  totalVolumes: IData[];
}

const getData = async (chain: string, timestamp: number) => {
  const dateId = getTimestampAtStartOfDayUTC(timestamp)

  const query = gql`{
    dailyVolume(id: ${dateId}) {
      volumeUsd
    }
    totalVolumes(first: 1) {
      volumeUsd
    }
  }
  `;

  const data: IGraph = await request(ENDPOINTS[chain], query);

  const dailyVolume = Number(data.dailyVolume?.volumeUsd ?? "0");

  return {
    dailyVolume: dailyVolume,
    timestamp: timestamp,
  };
};

export const fetchVolume = async (_: any, _t: any, options: FetchOptions) => {
  const data = await getData(options.chain, options.startOfDay);
  return {
    dailyVolume: data.dailyVolume,
    timestamp: data.timestamp,
  };
};

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SONIC]: {
      fetch: fetchVolume,
    },
  },
};

export default adapters;
