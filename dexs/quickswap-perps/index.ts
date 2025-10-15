import request, { gql } from "graphql-request";
import { Adapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderSymmioPerpsByName } from "../../helpers/symmio";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const methodology = {
  symmio: {
    Volume: 'builder code volume from Symmio Perps Trades.',
    Fees: 'builder code fees from Symmio Perps Trades.',
    Revenue: 'builder code revenue from Symmio Perps Trades.',
    ProtocolRevenue: 'builder code revenue from Symmio Perps Trades.',
    OpenInterest: 'builder code openInterest from Symmio Perps Trades.',
  },
  quickswap: {
    dailyVolume: "Total cumulativeVolumeUsd for specified chain for the given day",
  },
};

const endpoints = {
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/46725/quickperp-subgraph/version/latest",
};

interface IVolumeStat {
  cumulativeVolumeUsd: string;
  volumeUsd: string;
  id: string;
}

const graphs = (graphUrls: Record<string, string>) => {
  const fetch: Fetch = async (timestamp: number, _cb, { chain }) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const graphQuery = gql`
      query ($ts: Int!) {
        volumeStats(where: { timestamp: $ts, period: "daily" }) {
          volumeUsd
        }
      }
    `;
    const graphRes = await request(graphUrls[chain], graphQuery, { ts: todaysTimestamp });
    const volumeStats: IVolumeStat[] = graphRes.volumeStats ?? [];
    let dailyVolumeUSD = 0n;
    for (const v of volumeStats) dailyVolumeUSD += BigInt(v.volumeUsd || "0");
    const finalDailyVolume = Number(dailyVolumeUSD) / 1e30;
    return { dailyVolume: String(finalDailyVolume), timestamp: todaysTimestamp };
  };
  return fetch;
};

const adapter: Adapter = {
  version: 1,
  doublecounted: true,
  methodology: methodology.symmio,
  adapter: {
    [CHAIN.POLYGON_ZKEVM]: {
      start: '2024-01-01',
      fetch: graphs(endpoints)
      },
    [CHAIN.BASE]: {
      fetch: fetchBuilderSymmioPerpsByName("Quickswap"),
    },
  },
};

export default adapter;
