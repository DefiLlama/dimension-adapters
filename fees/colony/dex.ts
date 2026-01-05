import ADDRESSES from '../../helpers/coreAssets.json'
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph"
import { FetchOptions } from "../../adapters/types";
import { Balances } from "@defillama/sdk";
import BigNumber from "bignumber.js";
import { request, gql } from "graphql-request";

interface DexFees {
  dailyVolume: Balances
  dailyProtocolRevenue: Balances
  dailySupplySideRevenue: Balances
}

const usdcToken = ADDRESSES.avax.USDC;

export async function dexFees(
  options: FetchOptions,
  dexSubgraphEndpoint: string
): Promise<DexFees> {
  const { createBalances, getStartBlock, getEndBlock, chain } = options;

  let dailyVolume = createBalances()
  let dailyProtocolRevenue = createBalances()
  let dailySupplySideRevenue = createBalances()

  const VOLUME_USD = "volumeUSD";
  const FEES_USD = "feesUSD";

  // Get the subgraph's latest indexed block to avoid block availability issues
  const latestBlockQuery = gql`
    query {
      _meta {
        block {
          number
        }
      }
    }
  `;
  const latestBlockRes = await request(dexSubgraphEndpoint, latestBlockQuery);
  const subgraphLatestBlock = Number(latestBlockRes._meta.block.number);

  // Create custom options with safe start and end blocks
  const [originalStartBlock, originalEndBlock] = await Promise.all([
    getStartBlock(),
    getEndBlock(),
  ]);

  const safeStartBlock = Math.min(originalStartBlock, subgraphLatestBlock);
  const safeEndBlock = Math.min(originalEndBlock, subgraphLatestBlock);

  const customOptions = {
    ...options,
    getStartBlock: async () => safeStartBlock,
    getEndBlock: async () => safeEndBlock,
  };

  const v2Graph = getGraphDimensions2({
    graphUrls: {
      [chain]: dexSubgraphEndpoint,
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

  const results = await v2Graph(customOptions)
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
