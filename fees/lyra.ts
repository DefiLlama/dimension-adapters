import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";

const UNIT = BigInt("1000000000000000000");

const endpoints: Record<string, string> = {
  [CHAIN.OPTIMISM]: "https://subgraph.satsuma-prod.com/sw9vuxiQey3c/lyra/optimism-mainnet-newport/api",
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/sw9vuxiQey3c/lyra/arbitrum-mainnet/api",
};

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

const fetch = async (options: FetchOptions) => {
  const previousDayFees: IDayFeesResponse = await request(
    endpoints[options.chain],
    dailyFeesQuery,
    { timestamp: options.startOfDay }
  ).catch((e) =>
    console.error(`Failed to get total fees on ${options.chain}: ${e.message}`)
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
    dailyFees: prevDayFeesSum.dailyFees.toString(),
  };
};

const adapter: Adapter = {
  fetch,
  adapter: {
    [CHAIN.OPTIMISM]: {
      start: '2022-06-25',
    },
    [CHAIN.ARBITRUM]: {
      start: '2023-01-26',
    },
  },
  deadFrom: "2023-12-31",
};

export default adapter;
