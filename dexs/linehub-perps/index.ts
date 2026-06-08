import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints: any = {
  [CHAIN.LINEA]:
    "https://api.studio.thegraph.com/query/55804/linehub-trade/version/latest",
};

interface IVolumeStat {
  cumulativeVolumeUsd: string;
  volumeUsd: string;
  id: string;
}

const fetch = async ({ chain, startOfDay }: FetchOptions) => {

  const graphQuery = gql`
    query MyQuery {
      volumeStats(where: {timestamp: ${startOfDay}, period: "daily"}) {
        cumulativeVolumeUsd
        volumeUsd
        id
      }
    }
  `;

  const graphRes = await request(endpoints[chain], graphQuery);
  const volumeStats: IVolumeStat[] = graphRes.volumeStats;

  let dailyVolumeUSD = BigInt(0);

  volumeStats.forEach((vol) => {
    dailyVolumeUSD += BigInt(vol.volumeUsd);
  });

  const finalDailyVolume = parseInt(dailyVolumeUSD.toString()) / 1e18;

  return {
    dailyVolume: finalDailyVolume.toString(),
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.LINEA],
  start: '2024-07-02',
  deadFrom: '2025-10-31',
};

export default adapter;
