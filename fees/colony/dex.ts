import { getGraphDimensions } from "../../helpers/getUniSubgraph"
import { FetchOptions, FetchResultGeneric } from "../../adapters/types";

export async function dexRevenue(
  options: FetchOptions,
  dexSubgraphEndpoint: string,
  DexFactoryContract: string,
): Promise<FetchResultGeneric> {

  const endpoints = {
    [options.chain]: dexSubgraphEndpoint,
  };

  const VOLUME_USD = "volumeUSD";
  const FEES_USD = "feesUSD";

  const v2Graph = getGraphDimensions({
    graphUrls: endpoints,
    totalVolume: {
      factory: "factories",
      field: VOLUME_USD,
    },
    dailyVolume: {
      factory: "dayData",
      field: VOLUME_USD,
    },
    totalFees: {
      factory: "factories",
      field: FEES_USD,
    },
    dailyFees: {
      factory: "dayData",
      field: FEES_USD,
    },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 100, // Fees going back to liquidity providers
    }
  });

  return v2Graph(options.chain)(options)
}
