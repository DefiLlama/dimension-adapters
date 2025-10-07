import request, { gql } from "graphql-request";
import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
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

const fetchSymmioQuickswap = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, openInterestAtEnd } =
    await fetchBuilderSymmioPerpsByName({ options, affiliateName: 'Quickswap' });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, openInterestAtEnd };
};

const adapter: Adapter = {
  version: 2,
  doublecounted: true,
  methodology: methodology.symmio,
  adapter: {
    [CHAIN.POLYGON_ZKEVM]: {
      start: '2024-01-01',
      fetch: async (options: FetchOptions) => {
        const res = await graphs(endpoints)(options.startOfDay,undefined as any, { chain: options.chain } as any);
        const dailyVolume = options.createBalances();
        if (res?.dailyVolume) dailyVolume.addUSDValue(Number(res.dailyVolume));
        return { dailyVolume };
      },
    },
    [CHAIN.BASE]: {
      fetch: fetchSymmioQuickswap,
    },
  },
};

export default adapter;
