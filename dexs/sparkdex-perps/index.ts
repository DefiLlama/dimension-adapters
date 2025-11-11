import { gql, request } from "graphql-request";
import {
  SimpleAdapter,
  FetchResultVolume,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoint = "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-trade/latest/gn";

interface IVolumeStat {
  cumulativeVolumeUsd: string;
  volumeUsd: string;
  id: string;
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
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

  const response = await request(endpoint, graphQuery);
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

const methodology = {
  dailyVolume: "Total daily trading volume from all perpetual markets on SparkDEX",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
      start: '2024-11-05',
    },
  },
};

export default adapter;

