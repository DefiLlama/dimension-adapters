import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";
import BigNumber from "bignumber.js";

export interface ValidatorProgramFees {
  dailyProtocolRevenue: Balances;
  totalProtocolRevenue: Balances;
  dailyHoldersRevenue: Balances;
  totalHoldersRevenue: Balances;
}

interface IGraphEarlyStageFeesResponse {
  rewards: {
    amount: string
  }[]
  rewardPerTokenPerCategories: {
    amountTotal: string
  }[]
}

const wavaxToken = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7'

const queryValidatorProgramFees = gql
  `query ValidatorProgramFees($timestampFrom: BigInt!, $timestampTo: BigInt!) {
    rewards(
      where: {createdAt_gte: $timestampFrom, createdAt_lt: $timestampTo, token: "${wavaxToken}", categoryId: 1}
    ) {
      amount
    }
    rewardPerTokenPerCategories(
      where: {token: "${wavaxToken}", categoryId: 1}
    ) {
      amountTotal
    }
  }`;


export async function validatorProgramFees(
  options: FetchOptions,
  stakingV3SubgraphEndpoint: string,
): Promise<ValidatorProgramFees> {
  const { createBalances, startTimestamp, endTimestamp } = options;

  let dailyProtocolRevenue = createBalances()
  let totalProtocolRevenue = createBalances()
  let dailyHoldersRevenue = createBalances()
  let totalHoldersRevenue = createBalances()

  try {
    const res: IGraphEarlyStageFeesResponse = await request(stakingV3SubgraphEndpoint, queryValidatorProgramFees, {
      timestampFrom: startTimestamp,
      timestampTo: endTimestamp
    });

    if (res.rewards[0] !== undefined) {
      dailyProtocolRevenue.add(wavaxToken, new BigNumber(res.rewards[0].amount).div(0.7).multipliedBy(0.3).toFixed(0))
      dailyHoldersRevenue.add(wavaxToken, res.rewards[0].amount)
    }

    if (res.rewardPerTokenPerCategories[0] !== undefined) {
      totalProtocolRevenue.add(wavaxToken, new BigNumber(res.rewardPerTokenPerCategories[0].amountTotal).div(0.7).multipliedBy(0.3).toFixed(0))
      totalHoldersRevenue.add(wavaxToken, res.rewardPerTokenPerCategories[0].amountTotal)
    }

  } catch (e) {
    console.error(e);
  }

  return {
    dailyProtocolRevenue,
    totalProtocolRevenue,
    dailyHoldersRevenue,
    totalHoldersRevenue
  }
}
