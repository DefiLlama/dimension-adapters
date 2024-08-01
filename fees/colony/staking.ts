import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";

export interface StakingFees {
  dailyHoldersRevenue: Balances;
  totalHoldersRevenue: Balances;
}

interface ITotalStakeFees {
  totalStakeFees: string;
  totalUnstakeFees: string;
}

interface IDailyStakeFees {
  stakeFees: string;
  unstakeFees: string;
}

interface IGraphStakeResponse {
  metrics: ITotalStakeFees[];
  dailyMetrics: IDailyStakeFees[];
}

const queryStakingFeesMetrics = gql
`query fees($date: Int!) {
  metrics {
    totalStakeFees
    totalUnstakeFees
  }
  dailyMetrics(where: {date: $date}) {
    unstakeFees
    stakeFees
  }
}`;

export async function stakingFees(
  options: FetchOptions,
  stakingSubgraphEndpoint: string,
  ColonyGovernanceToken: string
): Promise<StakingFees> {
  const { createBalances, startTimestamp } = options;

  let dailyHoldersRevenue = createBalances()
  let totalHoldersRevenue = createBalances()

  const day = Math.floor(startTimestamp / 86400)
  const date = day * 86400

  try {
    const res: IGraphStakeResponse = await request(stakingSubgraphEndpoint, queryStakingFeesMetrics, { date });

    if (res.dailyMetrics && res.dailyMetrics.length) {
      dailyHoldersRevenue.add(ColonyGovernanceToken, res.dailyMetrics[0].stakeFees);
      dailyHoldersRevenue.add(ColonyGovernanceToken, res.dailyMetrics[0].unstakeFees);
    }

    if (res.metrics && res.metrics.length) {
      totalHoldersRevenue.add(ColonyGovernanceToken, res.metrics[0].totalStakeFees);
      totalHoldersRevenue.add(ColonyGovernanceToken, res.metrics[0].totalUnstakeFees);
    }

  } catch (e) {
    console.error(e);
  }

  return {
    dailyHoldersRevenue,
    totalHoldersRevenue
  }
}
