import { getGraphDimensions, getGraphDimensions2 } from "../../helpers/getUniSubgraph"
import { FetchOptions } from "../../adapters/types";
import { Balances } from "@defillama/sdk";
import BigNumber from "bignumber.js";

interface DexFees {
  dailyVolume: Balances
  dailyProtocolRevenue: Balances
  dailySupplySideRevenue: Balances
}

const usdcToken = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';

export async function dexFees(
  options: FetchOptions,
  dexSubgraphEndpoint: string
): Promise<DexFees> {
  const { createBalances } = options;

  let dailyVolume = createBalances()
  let dailyProtocolRevenue = createBalances()
  let dailySupplySideRevenue = createBalances()

  const VOLUME_USD = "volumeUSD";
  const FEES_USD = "feesUSD";

  const v2Graph = getGraphDimensions2({
    graphUrls: {
      [options.chain]: dexSubgraphEndpoint,
    },
    totalVolume: {
      factory: "factories",
      field: VOLUME_USD,
    },
    totalFees: {
      factory: "factories",
      field: FEES_USD,
    },
  });

  const results = await v2Graph(options.chain)(options)
  const resultsDailyFees = new BigNumber(results.dailyFees?.toString() ?? 0).multipliedBy(1e6)
  const resultsDailyVolume = new BigNumber(results.dailyVolume?.toString() ?? 0).multipliedBy(1e6)

  dailySupplySideRevenue.add(usdcToken, resultsDailyFees.multipliedBy(5).div(6).toFixed(0))

  dailyProtocolRevenue.add(usdcToken, resultsDailyFees.div(6).toFixed(0))

  dailyVolume.add(usdcToken, resultsDailyVolume.toFixed(0))

  return {
    dailyVolume,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}
