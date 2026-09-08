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

  return { dailyVolume };
};

export const fetch = async (options: FetchOptions) => {
  const data = await getData(options.chain, options.startOfDay);
  return {
    dailyVolume: data.dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SONIC],
  // The subgraph host is up but answers `deployment u61208/s106679/latest does not exist`, and
  // xpress.trade is NXDOMAIN, so there is nothing left to read. Last published point 2026-06-07.
  deadFrom: '2026-06-08',
};

export default adapter;
