import { getGraphDimensions } from "../../helpers/getUniSubgraph"
import { FetchOptions } from "../../adapters/types";
import { Balances } from "@defillama/sdk";
import BigNumber from "bignumber.js";

interface DexFees {
  timestamp: number
  block?: number
  dailyVolume: Balances
  totalVolume: Balances
  dailyProtocolRevenue: Balances
  totalProtocolRevenue: Balances
  dailySupplySideRevenue: Balances
  totalSupplySideRevenue: Balances
}

const usdcToken = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';

export async function dexFees(
  options: FetchOptions,
  dexSubgraphEndpoint: string
): Promise<DexFees> {
  const { createBalances } = options;

  let dailyVolume = createBalances()
  let totalVolume = createBalances()
  let dailyProtocolRevenue = createBalances()
  let totalProtocolRevenue = createBalances()
  let dailySupplySideRevenue = createBalances()
  let totalSupplySideRevenue = createBalances()

  const VOLUME_USD = "volumeUSD";
  const FEES_USD = "feesUSD";

  const v2Graph = getGraphDimensions({
    graphUrls: {
      [options.chain]: dexSubgraphEndpoint,
    },
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
    }
  });

  const results = await v2Graph(options.chain)(options)
  const resultsDailyFees = new BigNumber(results.dailyFees?.toString() ?? 0).multipliedBy(1e6)
  const resultsTotalFees = new BigNumber(results.totalFees?.toString() ?? 0).multipliedBy(1e6)
  const resultsDailyVolume = new BigNumber(results.dailyVolume?.toString() ?? 0).multipliedBy(1e6)
  const resultsTotalVolume = new BigNumber(results.totalVolume?.toString() ?? 0).multipliedBy(1e6)

  dailySupplySideRevenue.add(usdcToken, resultsDailyFees.multipliedBy(5).div(6).toFixed(0))
  totalSupplySideRevenue.add(usdcToken, resultsTotalFees.multipliedBy(5).div(6).toFixed(0))

  dailyProtocolRevenue.add(usdcToken, resultsDailyFees.div(6).toFixed(0))
  totalProtocolRevenue.add(usdcToken, resultsTotalFees.div(6).toFixed(0))

  dailyVolume.add(usdcToken, resultsDailyVolume.toFixed(0))
  totalVolume.add(usdcToken, resultsTotalVolume.toFixed(0))

  return {
    timestamp: results.timestamp,
    block: results.block,
    dailyVolume,
    totalVolume,
    dailyProtocolRevenue,
    totalProtocolRevenue,
    dailySupplySideRevenue,
    totalSupplySideRevenue
  }
}
