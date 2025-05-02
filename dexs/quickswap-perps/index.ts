import request, { gql } from "graphql-request";
import { Adapter, ChainEndpoints, Fetch, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/46725/quickperp-subgraph/version/latest",
};

interface IVolumeStat {
  cumulativeVolumeUsd: string;
  volumeUsd: string;
  id: string;
}

const graphs = (graphUrls: ChainEndpoints) => {
  const fetch: Fetch = async (timestamp: any, _cb: any, { chain, }) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    const graphQuery = gql`
    query MyQuery {
      volumeStats(where: {timestamp: ${todaysTimestamp}, period: "daily"}) {
        cumulativeVolumeUsd
        volumeUsd
        id
      }
    }
  `;

    const graphRes = await request(graphUrls[chain], graphQuery);
    const volumeStats: IVolumeStat[] = graphRes.volumeStats;

    let dailyVolumeUSD = BigInt(0);
    let totalVolumeUSD = BigInt(0);

    volumeStats.forEach((vol) => {
      dailyVolumeUSD += BigInt(vol.volumeUsd);
      totalVolumeUSD += BigInt(vol.cumulativeVolumeUsd);
    });

    const finalDailyVolume = parseInt(dailyVolumeUSD.toString()) / 1e30;
    const finalTotalVolume = parseInt(totalVolumeUSD.toString()) / 1e30;

    return {
      dailyVolume: finalDailyVolume.toString(),
      totalVolume: finalTotalVolume.toString(),
      timestamp: todaysTimestamp,
    };
  };
  return fetch;
};

const methodology = {
  dailyVolume:
    "Total cumulativeVolumeUsd for specified chain for the given day",
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: graphs(endpoints),
      start: '2024-01-01',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
