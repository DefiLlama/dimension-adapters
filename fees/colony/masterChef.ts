import ADDRESSES from '../../helpers/coreAssets.json'
import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";
import BigNumber from "bignumber.js";

const usdcToken = ADDRESSES.avax.USDC

export interface Airdrops {
  dailySupplySideRevenue: Balances;
  
}
interface IGraphAirdropsResponse {
  rewarders: {
    rewardToken: string
    name: string
    decimals: number
    schedule: {
      rangeAmount: string
    }[]
    startTimestamp: number
  }[]
}

interface ICeTokensResponse {
  projects: {
    ceToken: {
      id: string
    }
    tokenPrice: string
  }[]
}

const rewardersQuery = gql
  `{
    rewarders {
      rewardToken
      name
      decimals
      schedule {
        rangeAmount
      }
      startTimestamp
    }
  }`;

const ceTokensQuery = gql
  `{
    projects(where: {ceToken_not: null}) {
      ceToken {
        id
      }
      tokenPrice
    }
  }`;

function addTokenBalance(
  balance: Balances,
  prices: Map<string, string>,
  tokenAddress: string,
  tokenDecimals: number,
  rewarderSchedule: Array<{ rangeAmount: string }>,
  isCeToken: boolean
) {
  if (isCeToken) {
    const price = prices.get(tokenAddress.toLowerCase()) ?? 0
    const totalCeToken = rewarderSchedule.reduce((acc, x) => {
      return acc.plus(x.rangeAmount)
    }, new BigNumber(0))

    balance.add(usdcToken, totalCeToken.multipliedBy(price).div(new BigNumber(10).pow(tokenDecimals)).toFixed(0))
  }
  else {
    balance.add(tokenAddress, rewarderSchedule.reduce((acc, x) => {
      return acc.plus(x.rangeAmount)
    }, new BigNumber(0)).toFixed(0))
  }

  return balance
}

export async function masterChef(
  options: FetchOptions,
  masterChefSubgraphEndpoint: string,
  earlyStageSubgraphEndpoint: string,
): Promise<Airdrops> {
  const { createBalances, startTimestamp, endTimestamp } = options;

  let dailySupplySideRevenue = createBalances()

  try {
    const ceTokenRes: ICeTokensResponse = await request(earlyStageSubgraphEndpoint, ceTokensQuery);
    const priceMap = new Map()
    for (const ceToken of ceTokenRes.projects) {
      priceMap.set(ceToken.ceToken.id.toLowerCase(), ceToken.tokenPrice)
    }

    const rewardersRes: IGraphAirdropsResponse = await request(masterChefSubgraphEndpoint, rewardersQuery);
    for (const rewarder of rewardersRes.rewarders) {
      if (rewarder.startTimestamp >= startTimestamp && rewarder.startTimestamp < endTimestamp) {
        addTokenBalance(
          dailySupplySideRevenue,
          priceMap,
          rewarder.rewardToken,
          rewarder.decimals,
          rewarder.schedule,
          rewarder.name.includes(' ceToken')
        )
      }

    }

  } catch (e) {
    console.error(e);
  }

  return {
    dailySupplySideRevenue,
  }
}
