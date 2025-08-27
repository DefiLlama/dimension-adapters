import request, { gql } from "graphql-request";
import { Adapter, ChainEndpoints, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.LINEA]:
    "https://api.studio.thegraph.com/query/55804/linehub-trade/version/latest",
};

interface IVolumeStat {
  cumulativeVolumeUsd: string;
  volumeUsd: string;
  id: string;
}

const graphs = (graphUrls: ChainEndpoints) => {
  const fetch: FetchV2 = async ({ chain, startTimestamp }) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(startTimestamp);

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

    volumeStats.forEach((vol) => {
      dailyVolumeUSD += BigInt(vol.volumeUsd);
    });

    const finalDailyVolume = parseInt(dailyVolumeUSD.toString()) / 1e18;

    return {
      dailyVolume: finalDailyVolume.toString(),
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
  version: 2,
  methodology,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: graphs(endpoints),
      start: '2024-07-02',
    },
  },
};

export default adapter;
