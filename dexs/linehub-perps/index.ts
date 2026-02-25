import request, { gql } from "graphql-request";
import { Adapter, } from "../../adapters/types";
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

const fetch = async (_: any, _1: any, { chain, startOfDay }: any) => {

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

const methodology = {
  dailyVolume:
    "Total cumulativeVolumeUsd for specified chain for the given day",
};

const adapter: Adapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.LINEA]: {
      fetch,
      start: '2024-07-02',
    },
  },
};

export default adapter;
