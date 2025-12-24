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

const queryLatestIndexedBlock = gql`
  query {
    _meta {
      block {
        number
      }
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

  // Check latest indexed block to ensure data is available
  const metaRes = await request(stakingSubgraphEndpoint, queryLatestIndexedBlock);
  const latestIndexedBlock = metaRes._meta.block.number;

  if (startBlock > latestIndexedBlock) {
    throw new Error(
      `Subgraph has only indexed up to block ${latestIndexedBlock}, but start block ${startBlock} is required. Data for this time period is not yet available.`
    );
  }

  if (endBlock > latestIndexedBlock) {
    throw new Error(
      `Subgraph has only indexed up to block ${latestIndexedBlock}, but end block ${endBlock} is required. Data for this time period is not yet available.`
    );
  }

  let dailyHoldersRevenue = createBalances();

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

  return {
    dailyHoldersRevenue,
  };
}
