import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

const { request, gql } = require("graphql-request");

export interface StakingRevenue {
  totalFees: number;
  dailyFees: number;
  totalHoldersRevenue: number;
  dailyHoldersRevenue: number;
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

export async function stakingRevenue(
  options: FetchOptions,
  stakingSubgraphEndpoint: string,
  ColonyGovernanceToken: string,
  StakingV3Contract: string,
): Promise<StakingRevenue> {
  const { createBalances, startTimestamp } = options;

  let totalHoldersRevenue = createBalances();
  let dailyHoldersRevenue = createBalances();

  const day = Math.floor(startTimestamp / 86400)
  const date = day * 86400

  try {
    const res: IGraphStakeResponse = await request(stakingSubgraphEndpoint, queryStakingFeesMetrics, { date });

    if (res.metrics && res.metrics.length) {
      totalHoldersRevenue.add(ColonyGovernanceToken, res.metrics[0].totalStakeFees);
      totalHoldersRevenue.add(ColonyGovernanceToken, res.metrics[0].totalUnstakeFees);
    }

    if (res.dailyMetrics && res.dailyMetrics.length) {
      dailyHoldersRevenue.add(ColonyGovernanceToken, res.dailyMetrics[0].stakeFees);
      dailyHoldersRevenue.add(ColonyGovernanceToken, res.dailyMetrics[0].unstakeFees);
    }
  } catch (e) {
    console.error(e);
  }

  return {
    totalFees: await totalHoldersRevenue.getUSDValue(),
    dailyFees: await dailyHoldersRevenue.getUSDValue(),
    totalHoldersRevenue: await totalHoldersRevenue.getUSDValue(),
    dailyHoldersRevenue: await dailyHoldersRevenue.getUSDValue(),
  }
}
