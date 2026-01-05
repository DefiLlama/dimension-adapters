import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";

const queryStakingFeesMetrics = gql`
  query fees($block: Int!) {
    metrics(block: { number: $block }) {
      totalStakeFees
      totalUnstakeFees
    }
  }
`;

export async function stakingFees(
  options: FetchOptions,
  stakingSubgraphEndpoint: string,
  ColonyGovernanceToken: string,
): Promise<{
  dailyHoldersRevenue: Balances;
}> {
  const { createBalances, getStartBlock, getEndBlock } = options;

  const [startBlock, endBlock] = await Promise.all([
    getStartBlock(),
    getEndBlock(),
  ]);
  let dailyHoldersRevenue = createBalances();

  try {
    const [beforeRes, afterRes] = await Promise.all([
      request(stakingSubgraphEndpoint, queryStakingFeesMetrics, {
        block: startBlock,
      }),
      request(stakingSubgraphEndpoint, queryStakingFeesMetrics, {
        block: endBlock,
      }),
    ]);

    const beforeFees: number =
      Number(beforeRes.metrics[0].totalStakeFees) +
      Number(beforeRes.metrics[0].totalUnstakeFees);
    const afterFees: number =
      Number(afterRes.metrics[0].totalStakeFees) +
      Number(afterRes.metrics[0].totalUnstakeFees);

    dailyHoldersRevenue.add(ColonyGovernanceToken, afterFees - beforeFees);
  } catch (error: any) {
    // If subgraph is behind current blocks, try to get the latest available block
    if (error?.message?.includes('block number') && error?.message?.includes('not yet available')) {
      console.log(`Subgraph is behind current blocks. Using latest available data for staking fees.`);
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
        const latestBlockRes = await request(stakingSubgraphEndpoint, latestBlockQuery);
        const latestBlock = Number(latestBlockRes._meta.block.number);

        // Use the latest available block instead of endBlock
        const [beforeRes, afterRes] = await Promise.all([
          request(stakingSubgraphEndpoint, queryStakingFeesMetrics, {
            block: startBlock,
          }),
          request(stakingSubgraphEndpoint, queryStakingFeesMetrics, {
            block: latestBlock,
          }),
        ]);

        const beforeFees: number =
          Number(beforeRes.metrics[0].totalStakeFees) +
          Number(beforeRes.metrics[0].totalUnstakeFees);
        const afterFees: number =
          Number(afterRes.metrics[0].totalStakeFees) +
          Number(afterRes.metrics[0].totalUnstakeFees);

        dailyHoldersRevenue.add(ColonyGovernanceToken, afterFees - beforeFees);
      } catch (fallbackError) {
        console.log(`Failed to fetch staking fees data: ${fallbackError}`);
        // Return empty balances if both attempts fail
      }
    } else {
      console.log(`Failed to fetch staking fees data: ${error}`);
    }
  }

  return {
    dailyHoldersRevenue,
  };
}
