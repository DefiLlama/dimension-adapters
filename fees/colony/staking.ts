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
  const latestBlockRes = await request(stakingSubgraphEndpoint, latestBlockQuery);
  const subgraphLatestBlock = Number(latestBlockRes._meta.block.number);

  // Ensure both start and end blocks are within subgraph's available range
  const safeStartBlock = Math.min(startBlock, subgraphLatestBlock);
  const safeEndBlock = Math.min(endBlock, subgraphLatestBlock);

  const [beforeRes, afterRes] = await Promise.all([
    request(stakingSubgraphEndpoint, queryStakingFeesMetrics, {
      block: safeStartBlock,
    }),
    request(stakingSubgraphEndpoint, queryStakingFeesMetrics, {
      block: safeEndBlock,
    }),
  ]);

  const beforeFees: number =
    Number(beforeRes.metrics[0].totalStakeFees) +
    Number(beforeRes.metrics[0].totalUnstakeFees);
  const afterFees: number =
    Number(afterRes.metrics[0].totalStakeFees) +
    Number(afterRes.metrics[0].totalUnstakeFees);

  dailyHoldersRevenue.add(ColonyGovernanceToken, afterFees - beforeFees);

  return {
    dailyHoldersRevenue,
  };
}
