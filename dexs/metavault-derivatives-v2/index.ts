import * as sdk from "@defillama/sdk";
import { SimpleAdapter, FetchResultVolume, ChainEndpoints, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { Chain } from "../../adapters/types";
import request, { gql } from "graphql-request";

const endpoints: ChainEndpoints = {
  [CHAIN.LINEA]:
    "https://api.studio.thegraph.com/query/55804/linea-trade/version/latest",
  [CHAIN.POLYGON]:
    sdk.graph.modifyEndpoint('GAvL1WKMAVDdnSk96qvmSCMwL6pxfhAVYkQw6AgZU3td'),
};

interface IReferralRecord {
  volume: string; // Assuming volume is a string that represents a number
  timestamp: number;
}

interface IVolumeStat {
  cumulativeVolumeUsd: string;
  volumeUsd: string;
  id: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);

  const graphQuery = gql`
      query MyQuery {
        volumeStats(where: {timestamp: ${todaysTimestamp}, period: "daily"}) {
          cumulativeVolumeUsd
          id
          volumeUsd
        }
      }
    `;

  const response = await request(endpoints[options.chain], graphQuery);
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
const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.LINEA, CHAIN.POLYGON],
  start: '2024-03-01',
  deadFrom: "2025-06-04",
};

export default adapter;
