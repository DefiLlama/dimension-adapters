import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";
import fetchURL from "../../utils/fetchURL";

export interface Airdrops {
  dailyHoldersRevenue: Balances;
  totalHoldersRevenue: Balances;
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
  const { createBalances, startTimestamp } = options;

  let dailyHoldersRevenue = createBalances()
  let totalHoldersRevenue = createBalances()

  const day = Math.floor(startTimestamp / 86400)
  const date = day * 86400

  try {
    const res: IGraphAirdropsResponse = await request(stakingV3SubgraphEndpoint, queryAirdrops, {
      timestampFrom: date,
      timestampTo: date + 86400
    });

    if (res.rewards.length > 0) {
      for (const airdrop of res.rewards) {
        dailyHoldersRevenue.add(airdrop.token.id, airdrop.amount)
      }
    }
  } catch (e) {
    console.error(e);
  }

  try {
    const dataServiceResponse = await fetchURL('https://data-service.colonylab.io/airdrops')

    for (const airdrop of [...dataServiceResponse.airdrops[3] ?? [], ...dataServiceResponse.airdrops[4] ?? []]) {
      totalHoldersRevenue.add(airdrop.address, airdrop.airdroppedAmount)
    }
  }
  catch (e) {
    console.error(e);
  }

  return {
    dailyHoldersRevenue,
    totalHoldersRevenue
  }
}
