import { Adapter } from "../adapters/types";
import { ARBITRUM, OPTIMISM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import type { ChainEndpoints } from "../adapters/types";

const UNIT = BigInt("1000000000000000000");

const endpoints = {
  [OPTIMISM]: "https://subgraph.satsuma-prod.com/sw9vuxiQey3c/lyra/optimism-mainnet-newport/api",
  [ARBITRUM]: "https://subgraph.satsuma-prod.com/sw9vuxiQey3c/lyra/arbitrum-mainnet/api",
};

interface IGetChainFeesParams {
  graphUrls: {
    [chains: string]: string;
  };
  timestamp?: number;
}

interface IDayFeesResponse {
  marketVolumeAndFeesSnapshots: Array<{
    vegaFees: string;
    varianceFees: string;
    spotPriceFees: string;
    optionPriceFees: string;
    liquidatorFees: string;
    smLiquidationFees: string;
    lpLiquidationFees: string;
  }>;
}

const graph = (graphUrls: ChainEndpoints) => {
  const dailyFeesQuery = gql`
    query ($timestamp: Int) {
      marketVolumeAndFeesSnapshots(
        where: { period: 86400, timestamp: $timestamp }
      ) {
        vegaFees
        varianceFees
        spotPriceFees
        optionPriceFees
        liquidatorFees
        smLiquidationFees
        lpLiquidationFees
      }
    }
  `;

  return (chain: Chain) => {
    return async (timestamp: number) => {
      const cleanTimestamp = getUniqStartOfTodayTimestamp(
        new Date(timestamp * 1000)
      );
      const previousDayFees: IDayFeesResponse = await request(
        graphUrls[chain],
        dailyFeesQuery,
        { timestamp: cleanTimestamp }
      ).catch((e) =>
        console.error(`Failed to get total fees on ${chain}: ${e.message}`)
      );

      const prevDayFeesSum = previousDayFees.marketVolumeAndFeesSnapshots.reduce(
        (acc, obj) => {
          let vals = {
            dailyFees:
              BigInt(acc.dailyFees) +
              (BigInt(obj.vegaFees) +
                BigInt(obj.varianceFees) +
                BigInt(obj.spotPriceFees) +
                BigInt(obj.optionPriceFees) +
                BigInt(obj.liquidatorFees) +
                BigInt(obj.smLiquidationFees) +
                BigInt(obj.lpLiquidationFees)) /
                BigInt(UNIT),
          };

          return vals;
        },
        { dailyFees: BigInt(0) }
      );

      return {
        timestamp,
        dailyFees: prevDayFeesSum.dailyFees.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [OPTIMISM]: {
      fetch: graph(endpoints)(OPTIMISM),
      start: 1656154800,
    },
    [ARBITRUM]: {
      fetch: graph(endpoints)(ARBITRUM),
      start: 1674691200,
    },
  },
};

export default adapter;
