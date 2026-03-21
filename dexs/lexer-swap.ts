import { SimpleAdapter, FetchResultVolume } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraph/utils";

const apiEndPoints = [
  "https://api.studio.thegraph.com/query/50217/synth-stat-v2-arb-mainnet/version/latest",
  "https://api.studio.thegraph.com/query/50217/core-stat-v2-arb-mainnet/version/latest",
];

interface VolumeStatsQuery {
  swap: string;
  mint: string;
  burn: string;
  liquidation: string;
  margin: string;
}

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      swap
    }
  }
`;

const fetchSwapValue = async (timestamp: number): Promise<FetchResultVolume> => {
  let dailyVolume = 0;
  const t = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  for (const api of apiEndPoints) {
    const swap: VolumeStatsQuery[] = (
      await request(api, historicalDataSwap, {
        id: String(t),
        period: "daily",
      })
    ).volumeStats as VolumeStatsQuery[];
    dailyVolume += Number(swap.reduce((acc, cur) => acc + Number(cur.swap), 0));
  }
  dailyVolume /= 1e30;
  return {
    timestamp,
    dailyVolume: String(dailyVolume),
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchSwapValue,
      start: '2024-01-09',
    }
  }
};

export default adapter;
