import request, { gql } from "graphql-request";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const grizzlyPerpsV2Subgraph =
  "https://api.studio.thegraph.com/query/55804/bnb-trade/version/latest";

interface IReferralRecord {
  volume: string; // Assuming volume is a string that represents a number
  timestamp: number;
}

interface IVolumeStat {
  cumulativeVolumeUsd: string;
  volumeUsd: string;
  id: string;
}

const fetch = () => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    const graphQuery = gql`
      query MyQuery {
        volumeStats(where: {timestamp: ${todaysTimestamp}, period: "daily"}) {
          cumulativeVolumeUsd
          id
          volumeUsd
        }
      }
    `;

    const response = await request(grizzlyPerpsV2Subgraph, graphQuery);
    const volumeStats: IVolumeStat[] = response.volumeStats;

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
};

const methodology = {
  dailyVolume:
    "Total cumulativeVolumeUsd for specified chain for the given day",
};

const adapter: SimpleAdapter = {
        methodology,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch(),
      start: '2024-02-02',
    },
  },
};

export default adapter;
