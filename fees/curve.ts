import { Adapter } from "../adapters/types";
import { ARBITRUM, ETHEREUM, OPTIMISM, POLYGON, AVAX, FANTOM, XDAI } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from "../utils/date";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-mainnet",
  [OPTIMISM]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-optimism",
  [ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-arbitrum",
  [POLYGON]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-matic",
  [AVAX]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-avalanche",
  [FANTOM]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-fantom",
  [XDAI]:
    "https://api.thegraph.com/subgraphs/name/convex-community/volume-xdai",
};

const graph = (graphUrls: ChainEndpoints) => {
  const graphQuery = gql`query fees($timestampEndOfDay: Int!) 
  {
    dailyPoolSnapshots (
      orderBy: timestamp
      orderDirection: desc
      first: 1000
      where: {
        timestamp: $timestampEndOfDay
      }
    ) {
      totalDailyFeesUSD
      adminFeesUSD
      lpFeesUSD
      pool {
        symbol
      }
      timestamp
    }
  }`;

  return (chain: Chain) => {
    return async (timestamp: number) => {

      const timestampEndOfDay = getTimestampAtStartOfDayUTC(timestamp+60*60*24)
      const graphRes = await request(graphUrls[chain], graphQuery, {
        timestampEndOfDay
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
        dailyUserFees: dailyFee.toString(),
        dailyFees: dailyFee.toString(),
        dailyProtocolRevenue: "0",
        dailyHoldersRevenue: dailyRev.toString(),
        dailyRevenue: dailyRev.toString(),
        dailySupplySideRevenue: dailyLPRev.toString()
      };
    }
  }
};

const methodology = {
  UserFees: "Users pay a trading fee from 0.04% to 0.4% on each swap (as of July 2022, the fee on all pools was 0.04%)",
  Fees: "Trading fees paid by users",
  Revenue: "A 50% of the trading fee is collected by veCRV holders",
  ProtocolRevenue: "Treasury have no revenue",
  HoldersRevenue: "A 50% of the trading fee is collected by the users who have vote locked their CRV",
  SupplySideRevenue: "A 50% of all trading fees are distributed among liquidity providers"
}

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch: graph(endpoints)(ETHEREUM),
      start: async () => 1577854800,
      meta: {
        methodology
      }
    },
    [OPTIMISM]: {
      fetch: graph(endpoints)(OPTIMISM),
      start: async () => 1620532800,
      meta: {
        methodology
      }
    },
    [ARBITRUM]: {
      fetch: graph(endpoints)(ARBITRUM),
      start: async () => 1632110400,
      meta: {
        methodology
      }
    },
    [POLYGON]: {
      fetch: graph(endpoints)(POLYGON),
      start: async () => 1620014400,
      meta: {
        methodology
      }
    },
    [AVAX]: {
      fetch: graph(endpoints)(AVAX),
      start: async () => 1633492800,
      meta: {
        methodology
      }
    },
    [FANTOM]: {
      fetch: graph(endpoints)(FANTOM),
      start: async () => 1620532800,
      meta: {
        methodology
      }
    },
    [XDAI]: {
      fetch: graph(endpoints)(XDAI),
      start: async () => 1620532800,
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
