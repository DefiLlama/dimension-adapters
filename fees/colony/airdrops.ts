/*import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";
import fetchURL from "../../utils/fetchURL";

export interface Airdrops {
  dailyHoldersRevenue: Balances;
}

interface IGraphAirdropsResponse {
  rewards: {
    token: {
      id: string
    }
    amount: string
  }[]
}

const queryAirdrops = gql
  `query Airdrops($timestampFrom: BigInt!, $timestampTo: BigInt!) {
    rewards(
      where: {createdAt_gte: $timestampFrom, createdAt_lt: $timestampTo, categoryId_in: [3, 4]}
    ) {
      token {
        id
      }
      amount
    }
  }`;

export async function airdrops(
  options: FetchOptions,
  stakingV3SubgraphEndpoint: string,
): Promise<Airdrops> {
  const { createBalances, startTimestamp, endTimestamp } = options;

  let dailyHoldersRevenue = createBalances()

  try {
    const res: IGraphAirdropsResponse = await request(stakingV3SubgraphEndpoint, queryAirdrops, {
      timestampFrom: startTimestamp,
      timestampTo: endTimestamp
    });

    if (res.rewards.length > 0) {
      for (const airdrop of res.rewards) {
        dailyHoldersRevenue.add(airdrop.token.id, airdrop.amount)
      }
    }
  } catch (e) {
    console.error(e);
  }

  return {
    dailyHoldersRevenue,
  }
}*/