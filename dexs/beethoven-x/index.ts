import * as sdk from "@defillama/sdk";
import { ChainEndpoints, FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import request, { gql } from "graphql-request";

const endpoints: ChainEndpoints = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('CcWtE5UMUaoKTRu8LWjzambKJtgUVjcN31pD5BdffVzK'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('FsmdxmvBJLGjUQPxKMRtcWKzuCNpomKuMTbSbtRtggZ7'),
  [CHAIN.SONIC]: sdk.graph.modifyEndpoint("wwazpiPPt5oJMiTNnQ2VjVxKnKakGDuE2FfEZPD4TKj"),
};

interface IPool {
  id: string;
  swapVolume: string;
}

interface IPoolSnapshot {
  today: IPool[];
  yesterday: IPool[];
}


const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const startTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp)
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

  const graphRes: IPoolSnapshot = (await request(endpoints[options.chain], graphQuery));
  const dailyVolume = graphRes["today"].map((p: IPool) => {
    const yesterdayValue = Number(graphRes.yesterday.find((e: IPool) => e.id.split('-')[0] === p.id.split('-')[0])?.swapVolume || '0')
    if (yesterdayValue === 0) return 0;
    return Number(p.swapVolume) - yesterdayValue;
  }).filter(e => e < 100_000_000).reduce((a: number, b: number) => a + b, 0)

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  start: '2021-10-05',
  chains: Object.keys(endpoints),
};

export default adapter;
