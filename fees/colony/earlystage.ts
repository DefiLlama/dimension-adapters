import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";
import BigNumber from "bignumber.js";

const usdcToken = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'

export interface EarlyStageFees {
  dailyProtocolRevenue: Balances;
  totalProtocolRevenue: Balances;
  dailyHoldersRevenue: Balances;
  totalHoldersRevenue: Balances;
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
  let totalProtocolRevenue = createBalances()
  let dailyHoldersRevenue = createBalances()
  let totalHoldersRevenue = createBalances()

  try {
    const res: IGraphEarlyStageFeesResponse = await request(earlystageSubgraphEndpoint, queryEarlyStageFees);

    if (res.projectDistributions && res.projectDistributions.length) {
      const todayRes = res.projectDistributions.filter(x => x.timestamp >= startTimestamp && x.timestamp < endTimestamp)

      // --- Protocol Revenue
      dailyProtocolRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, x.stablecoinColonyFee)
        return acc
      }, dailyProtocolRevenue)

      totalProtocolRevenue = res.projectDistributions.reduce((acc: Balances, x) => {
        acc.add(usdcToken, x.stablecoinColonyFee)
        return acc
      }, totalProtocolRevenue)

      dailyProtocolRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, new BigNumber(x.ceTokenColonyFee).multipliedBy(x.project.tokenPrice).div(new BigNumber(10).pow(18)).toFixed(0))
        return acc
      }, dailyProtocolRevenue)

      totalProtocolRevenue = res.projectDistributions.reduce((acc: Balances, x) => {
        acc.add(usdcToken, new BigNumber(x.ceTokenColonyFee).multipliedBy(x.project.tokenPrice).div(new BigNumber(10).pow(18)).toFixed(0))
        return acc
      }, totalProtocolRevenue)

      dailyProtocolRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, new BigNumber(x.ceTokenDexInitialLiquidity).multipliedBy(x.project.tokenPrice).div(new BigNumber(10).pow(18)).toFixed(0))
        return acc
      }, dailyProtocolRevenue)

      totalProtocolRevenue = res.projectDistributions.reduce((acc: Balances, x) => {
        acc.add(usdcToken, new BigNumber(x.ceTokenDexInitialLiquidity).multipliedBy(x.project.tokenPrice).div(new BigNumber(10).pow(18)).toFixed(0))
        return acc
      }, totalProtocolRevenue)

      dailyProtocolRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, x.stablecoinInitialLiquidity)
        return acc
      }, dailyProtocolRevenue)

      totalProtocolRevenue = res.projectDistributions.reduce((acc: Balances, x) => {
        acc.add(usdcToken, x.stablecoinInitialLiquidity)
        return acc
      }, totalProtocolRevenue)

      // --- Holders Revenue
      dailyHoldersRevenue = todayRes.reduce((acc: Balances, x) => {
        acc.add(usdcToken, new BigNumber(x.ceTokenStakingReward).multipliedBy(x.project.tokenPrice).div(new BigNumber(10).pow(18)).toFixed(0))
        return acc
      }, dailyHoldersRevenue)

      totalHoldersRevenue = res.projectDistributions.reduce((acc: Balances, x) => {
        acc.add(usdcToken, new BigNumber(x.ceTokenStakingReward).multipliedBy(x.project.tokenPrice).div(new BigNumber(10).pow(18)).toFixed(0))
        return acc
      }, totalHoldersRevenue)
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
