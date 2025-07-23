import ADDRESSES from '../../helpers/coreAssets.json'
import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";
import BigNumber from "bignumber.js";

const usdcToken = ADDRESSES.avax.USDC

export interface EarlyStageFees {
  dailyProtocolRevenue: Balances;
  dailyHoldersRevenue: Balances;
}

interface IProjectDistribution {
  project: {
    tokenPrice: string;
  }
  ceTokenColonyFee: string;
  ceTokenStakingReward: string;
  ceTokenDexBoost: string;
  ceTokenDexInitialLiquidity: string;
  stablecoinInitialLiquidity: string;
  stablecoinColonyFee: string;
  timestamp: number
}

interface IGraphEarlyStageFeesResponse {
  projectDistributions: IProjectDistribution[];
}

const queryEarlyStageFees = gql
`query fees {
  projectDistributions(first: 1000) {
    project {
      tokenPrice
    }
    ceTokenColonyFee
    ceTokenStakingReward
    ceTokenDexBoost
    ceTokenDexInitialLiquidity
    stablecoinInitialLiquidity
    stablecoinColonyFee
    timestamp
  }
}`;

export async function earlyStageFees(
  options: FetchOptions,
  earlystageSubgraphEndpoint: string,
): Promise<EarlyStageFees> {
  const { createBalances, startTimestamp, endTimestamp } = options;

  let dailyProtocolRevenue = createBalances()
  let dailyHoldersRevenue = createBalances()

  try {
    const res: IGraphEarlyStageFeesResponse = await request(earlystageSubgraphEndpoint, queryEarlyStageFees);

    if (res.projectDistributions && res.projectDistributions.length) {
      const todayRes = res.projectDistributions.filter(x => x.timestamp >= startTimestamp && x.timestamp < endTimestamp)

      // --- Protocol Revenue
      dailyProtocolRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, x.stablecoinColonyFee)
        return acc
      }, dailyProtocolRevenue)

      dailyProtocolRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, new BigNumber(x.ceTokenColonyFee).multipliedBy(x.project.tokenPrice).div(new BigNumber(10).pow(18)).toFixed(0))
        return acc
      }, dailyProtocolRevenue)

      dailyProtocolRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, new BigNumber(x.ceTokenDexInitialLiquidity).multipliedBy(x.project.tokenPrice).div(new BigNumber(10).pow(18)).toFixed(0))
        return acc
      }, dailyProtocolRevenue)

      dailyProtocolRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, x.stablecoinInitialLiquidity)
        return acc
      }, dailyProtocolRevenue)

      // --- Holders Revenue
      dailyHoldersRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, new BigNumber(x.ceTokenStakingReward).multipliedBy(x.project.tokenPrice).div(new BigNumber(10).pow(18)).toFixed(0))
        return acc
      }, dailyHoldersRevenue)

    }
  } catch (e) {
    console.error(e);
  }

  return {
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}
