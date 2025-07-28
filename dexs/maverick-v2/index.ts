import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type {
  Adapter,
  FetchResultV2,
  ChainBlocks,
  ChainEndpoints,
  FetchOptions,
} from "../../adapters/types";
import { Chain } from "../../adapters/types";

interface GqlPoolDayStats {
  tokenBVolume: number;
  tokenAVolume: number;
  pool: GqlPool;
  timestamp: number;
}

interface GqlPool {
  id: string;
  feeAIn: number;
  feeBIn: number;
  tokenA: GqlToken;
  tokenB: GqlToken;
}

interface GqlToken {
  id: string;
  symbol: string;
  decimals: number;
}

interface GqlQueryResponse {
  poolDayStats: GqlPoolDayStats[];
}

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint(
    "4rnXYgSTMmzV9F9r43jhhv6wijfp53xTUj3SvSBaqMTg",
  ),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint(
    "9oEipJ8CzpnQ4PnCDBQFa16AME8E9r3Kr4GurTtdUKRh",
  ),
  [CHAIN.ERA]: sdk.graph.modifyEndpoint(
    "CNr8WTqBRNG5XbJQdSHX5jjfiQQyuFpkpBctTw1sDsDj",
  ),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint(
    "5RB6VU4vm5CrMAhvf9HFurkc8pZTF4WGBb1khZ4UhUng",
  ),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint(
    "E67Z1ykigDsybn4fnWuNHn4AcpuCxfjwzwPQxZs5r5c",
  ),
  [CHAIN.SCROLL]: sdk.graph.modifyEndpoint(
    "CNr8WTqBRNG5XbJQdSHX5jjfiQQyuFpkpBctTw1sDsDj",
  ),
};

const processAmount = (
  fee: number,
  decimals: number,
  volume: number,
): { feeTokenUnits: bigint; volumeTokenUnits: bigint } => {
  const volumeTokenUnits = BigInt(Math.round(volume * Math.pow(10, decimals)));
  const feeTokenUnits = BigInt(
    Math.round(fee * volume * Math.pow(10, decimals)),
  );

  return { feeTokenUnits, volumeTokenUnits };
};

const graph = (graphUrls: ChainEndpoints) => {
  const graphQuery = gql`
    query data($timestampFrom: Int!, $timestampTo: Int!) {
      poolDayStats(
        where: { timestamp_gt: $timestampFrom, timestamp_lte: $timestampTo }
      ) {
        tokenBVolume
        tokenAVolume
        pool {
          id
          feeAIn
          feeBIn
          tokenA {
            id
            symbol
            decimals
          }
          tokenB {
            id
            symbol
            decimals
          }
        }
        timestamp
      }
    }
  `;

  return (chain: Chain) => {
    return async (
      timestamp: number,
      _: ChainBlocks,
      { createBalances, fromTimestamp, toTimestamp }: FetchOptions,
    ): Promise<FetchResultV2> => {
      const dailyFees = createBalances();
      const dailyVolume = createBalances();

      try {
        const graphRes: GqlQueryResponse = await request(
          graphUrls[chain],
          graphQuery,
          {
            timestampFrom: fromTimestamp,
            timestampTo: toTimestamp,
          },
        );

        if (graphRes && graphRes.poolDayStats) {
          for (const stats of graphRes.poolDayStats) {
            const { feeTokenUnits: feeA, volumeTokenUnits: volumeA } =
              processAmount(
                stats.pool.feeAIn,
                stats.pool.tokenA.decimals,
                stats.tokenAVolume,
              );

            const { feeTokenUnits: feeB, volumeTokenUnits: volumeB } =
              processAmount(
                stats.pool.feeBIn,
                stats.pool.tokenB.decimals,
                stats.tokenBVolume,
              );

            dailyFees.add(stats.pool.tokenA.id, feeA);
            dailyFees.add(stats.pool.tokenB.id, feeB);
            dailyVolume.add(stats.pool.tokenA.id, volumeA);
            dailyVolume.add(stats.pool.tokenB.id, volumeB);
          }
        }

        return {
          dailyVolume: dailyVolume,
          dailyFees: dailyFees,
        };
      } catch (error) {
        console.error(`Error fetching data for ${chain}:`, error);
        return {
          dailyVolume: createBalances(),
          dailyFees: createBalances(),
        };
      }
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(endpoints)(CHAIN.ETHEREUM),
      start: '2024-06-03',
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(endpoints)(CHAIN.ARBITRUM),
      start: '2024-06-03',
    },
    [CHAIN.ERA]: {
      fetch: graph(endpoints)(CHAIN.ERA),
      start: '2024-06-03',
    },
    [CHAIN.BSC]: {
      fetch: graph(endpoints)(CHAIN.BSC),
      start: '2024-06-03',
    },
    [CHAIN.BASE]: {
      fetch: graph(endpoints)(CHAIN.BASE),
      start: '2024-06-03',
    },
    [CHAIN.SCROLL]: {
      fetch: graph(endpoints)(CHAIN.SCROLL),
      start: '2024-07-10',
    },
  },
};

export default adapter;
