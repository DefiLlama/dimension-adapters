import { BreakdownAdapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";

// TODO: change these endpoints
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

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      liquidation
      margin
    }
  }
`;

const fetchSwapValue = async (timestamp: number): Promise<FetchResultVolume> => {
  let dailyVolume = 0;
  let totalVolume = 0;
  const t = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  for (const api of apiEndPoints) {
    const  swap: VolumeStatsQuery[]   = (
      await request(api, historicalDataSwap, {
        id: String(t),
        period: "daily",
      })
    ).volumeStats as VolumeStatsQuery[];
    dailyVolume += Number(swap.reduce((acc, cur) => acc + Number(cur.swap), 0));
    const totalSwap = (
      await request(api, historicalDataSwap, {
        id: "total",
        period: "total",
      })
    ).volumeStats as VolumeStatsQuery[];
    totalVolume += Number(totalSwap.reduce((acc, cur) => acc + Number(cur.swap), 0));
  }
  dailyVolume /= 1e30;
  totalVolume /= 1e30;
  return {
    timestamp,
    dailyVolume: String(dailyVolume),
    totalVolume: String(totalVolume),
  };
}

const fetchDerivativesValue = async (timestamp: number): Promise<FetchResultVolume> => {
  let totalVolume = 0;
  let dailyVolume = 0;
  const t = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  for (const api of apiEndPoints) {
    const  derivatives: VolumeStatsQuery[]   = (
      await request(api, historicalDataDerivatives, {
        id: String(t),
        period: "daily",
      })
    ).volumeStats as VolumeStatsQuery[];
    dailyVolume += derivatives.length ? Number(
      Object.values(derivatives[0] || {}).reduce((sum, element) =>
        String(Number(sum) + Number(element))
      )
    ) : 0

    const totalDerivatives = (
      await request(api, historicalDataDerivatives, {
        id: "total",
        period: "total",
      })
    ).volumeStats as VolumeStatsQuery[];
    totalVolume += totalDerivatives.length ? Number(
      Object.values(totalDerivatives[0] || {}).reduce((sum, element) =>
        String(Number(sum) + Number(element))
      )
    ) : 0
  }
  dailyVolume /= 1e30;
  totalVolume /= 1e30;
  return {
    timestamp,
    totalVolume: String(totalVolume),
    dailyVolume: String(dailyVolume),
  };
}

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchSwapValue,
        start: 1704758400,
      }
    },
    derivatives: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchDerivativesValue,
        start: 1704758400,
      }
    }
  }
};

export default adapter;
