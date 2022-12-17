import { Adapter } from "../adapters/types";
import { ARBITRUM, ETHEREUM, OPTIMISM, POLYGON, AVAX, FANTOM, XDAI } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from "../utils/date";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-mainnet-test",
  [OPTIMISM]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-optimism-test",
  [ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-arbitrum-test",
  [POLYGON]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-matic-test",
  [AVAX]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-avalanche-test",
  [FANTOM]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-fantom-test",
  [XDAI]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-xdai-test",
};

const graph = (graphUrls: ChainEndpoints) => {
  const graphQuery = gql`query fees($yesterdaysTimestamp: Int!, $todaysTimestamp: Int!) 
  {
    dailyPoolSnapshots (
      orderBy: timestamp
      orderDirection: desc
      first: 1000
      where: {
        timestamp_gte: $yesterdaysTimestamp
        timestamp_lt: $todaysTimestamp
      }
    ) {
      totalDailyFeesUSD
      adminFeesUSD
      lpFeesUSD
      pool {
        symbol
      }
    }
  }`;

  return (chain: Chain) => {
    return async (timestamp: number) => {

      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)

      const graphRes = await request(graphUrls[chain], graphQuery, {
        todaysTimestamp, yesterdaysTimestamp
      });
      const feesPerPool = graphRes.dailyPoolSnapshots.filter((v: any) => v.pool.symbol !== 'A3CRV-f').map((vol: any): number => {
        return parseFloat(vol.totalDailyFeesUSD);
      })
      const revPerPool = graphRes.dailyPoolSnapshots.filter((v: any) => v.pool.symbol !== 'A3CRV-f').map((vol: any): number => {
        return parseFloat(vol.adminFeesUSD);
      });
      const revLPPerPool = graphRes.dailyPoolSnapshots.filter((v: any) => v.pool.symbol !== 'A3CRV-f').map((vol: any): number => {
        return parseFloat(vol.lpFeesUSD);
      });

      const dailyFee = feesPerPool.reduce((acc: number, curr: number) => acc + curr, 0.);
      const dailyRev = revPerPool.reduce((acc: number, curr: number) => acc + curr, 0.);
      const dailyLPRev = revLPPerPool.reduce((acc: number, curr: number) => acc + curr, 0.);

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyRev.toString(),
        dailySupplySideRevenue: dailyLPRev.toString()
      };
    }
  }
};

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch: graph(endpoints)(ETHEREUM),
      start: async () => 1577854800,
    },
    [OPTIMISM]: {
      fetch: graph(endpoints)(OPTIMISM),
      start: async () => 1620532800,
    },
    [ARBITRUM]: {
      fetch: graph(endpoints)(ARBITRUM),
      start: async () => 1632110400,
    },
    [POLYGON]: {
      fetch: graph(endpoints)(POLYGON),
      start: async () => 1620014400,
    },
    [AVAX]: {
      fetch: graph(endpoints)(AVAX),
      start: async () => 1633492800,
    },
    [FANTOM]: {
      fetch: graph(endpoints)(FANTOM),
      start: async () => 1620532800,
    },
    [XDAI]: {
      fetch: graph(endpoints)(XDAI),
      start: async () => 1620532800,
    },
  }
}

export default adapter;
