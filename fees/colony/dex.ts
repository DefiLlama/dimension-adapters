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
  const { createBalances, getStartBlock, getEndBlock } = options;

  let dailyVolume = createBalances()
  let dailyProtocolRevenue = createBalances()
  let dailySupplySideRevenue = createBalances()

  const VOLUME_USD = "volumeUSD";
  const FEES_USD = "feesUSD";

  try {
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

    const results = await v2Graph(options)
    const resultsDailyFees = new BigNumber(results.dailyFees?.toString() ?? 0).multipliedBy(1e6)
    const resultsDailyVolume = new BigNumber(results.dailyVolume?.toString() ?? 0).multipliedBy(1e6)

    dailySupplySideRevenue.add(usdcToken, resultsDailyFees.multipliedBy(5).div(6).toFixed(0))
    dailyProtocolRevenue.add(usdcToken, resultsDailyFees.div(6).toFixed(0))
    dailyVolume.add(usdcToken, resultsDailyVolume.toFixed(0))
  } catch (error: any) {
    // If subgraph is behind current blocks, try to get the latest available block
    if (error?.message?.includes('block number') && error?.message?.includes('not yet available')) {
      console.log(`DEX subgraph is behind current blocks. Using latest available data for DEX fees.`);
      try {
        // Get the subgraph's latest indexed block
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
        const latestBlock = Number(latestBlockRes._meta.block.number);

        // Create custom options with the latest block
        const customOptions = {
          ...options,
          getEndBlock: async () => latestBlock,
        };

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

        const results = await v2Graph(customOptions)
        const resultsDailyFees = new BigNumber(results.dailyFees?.toString() ?? 0).multipliedBy(1e6)
        const resultsDailyVolume = new BigNumber(results.dailyVolume?.toString() ?? 0).multipliedBy(1e6)

        dailySupplySideRevenue.add(usdcToken, resultsDailyFees.multipliedBy(5).div(6).toFixed(0))
        dailyProtocolRevenue.add(usdcToken, resultsDailyFees.div(6).toFixed(0))
        dailyVolume.add(usdcToken, resultsDailyVolume.toFixed(0))
      } catch (fallbackError) {
        console.log(`Failed to fetch DEX fees data: ${fallbackError}`);
        // Return empty balances if both attempts fail
      }
    } else {
      console.log(`Failed to fetch DEX fees data: ${error}`);
    }
  }

  return {
    dailyVolume,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}
