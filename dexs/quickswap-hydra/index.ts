import request, { gql } from "graphql-request";
import { Adapter, ChainEndpoints, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints: ChainEndpoints = {
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/55804/hydra-trade/version/latest",
  [CHAIN.MANTA]:
    "https://api.goldsky.com/api/public/project_cly4708cqpcj601tt7gzf1jdj/subgraphs/manta-trade/latest/gn",
};

interface IVolumeStat {
  cumulativeVolumeUsd: string;
  volumeUsd: string;
  id: string;
}

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);

  const graphQuery = gql`
    query MyQuery {
      volumeStats(where: {timestamp: ${todaysTimestamp}, period: "daily"}) {
        cumulativeVolumeUsd
        volumeUsd
        id
      }
    }
  `;

  const graphRes = await request(endpoints[options.chain], graphQuery);
  const volumeStats: IVolumeStat[] = graphRes.volumeStats;

  let dailyVolumeUSD = BigInt(0);
  let totalVolumeUSD = BigInt(0);

  volumeStats.forEach((vol) => {
    dailyVolumeUSD += BigInt(vol.volumeUsd);
    totalVolumeUSD += BigInt(vol.cumulativeVolumeUsd);
  });

  const finalDailyVolume = parseInt(dailyVolumeUSD.toString()) / 1e18;

  return {
    dailyVolume: finalDailyVolume.toString(),
    timestamp: todaysTimestamp,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.POLYGON_ZKEVM, CHAIN.MANTA],
  start: '2024-07-02',
};

export default adapter;
