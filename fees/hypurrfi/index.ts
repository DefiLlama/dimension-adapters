import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { Adapter, FetchOptions } from "../../adapters/types";

const ONE_DAY = 24 * 60 * 60;

const ENDPOINTS = {
  [CHAIN.HYPERLIQUID]: 'https://api.goldsky.com/api/public/project_cm92vgbeltp2b01vj9gcv74bl/subgraphs/hypurrfi/1.0/gn',
};

const POOL_ADDRESSES = {
  [CHAIN.HYPERLIQUID]: '0xa73ff12d177d8f1ec938c3ba0e87d33524dd5594',
};

export type V3Reserve = {
  lifetimeFlashLoanLPPremium : string
  lifetimeFlashLoanProtocolPremium: string
  lifetimePortalLPFee: string
  lifetimePortalProtocolFee: string
  lifetimeReserveFactorAccrued: string
  accruedToTreasury: string
  lifetimeDepositorsInterestEarned: string
  priceInUsd: string
  reserve: {
    decimals: number
    symbol: string
    underlyingAsset: string;
  }
}

const fetchReserves = async (timestamp: number, chain: string): Promise<V3Reserve[]> => {
  const graphQuery = `{
    reserves(where: { pool: "${POOL_ADDRESSES[chain]}" }) {
      id
      paramsHistory(
        where: { timestamp_lte: ${timestamp}, timestamp_gte: ${timestamp - ONE_DAY} },
        orderBy: "timestamp",
        orderDirection: "desc",
        first: 1
      ) {
        id
        priceInEth
        priceInUsd
        reserve {
          decimals
          symbol
          underlyingAsset
        }
        lifetimeFlashLoanLPPremium
        lifetimeFlashLoanProtocolPremium
        lifetimePortalLPFee
        lifetimePortalProtocolFee
        lifetimeReserveFactorAccrued
        lifetimeDepositorsInterestEarned: lifetimeSuppliersInterestEarned
        accruedToTreasury
      }
    }
  }`;
  
  const graphRes = await request(ENDPOINTS[chain], graphQuery);
  const reserves = graphRes.reserves.map((r: any) => r.paramsHistory[0]).filter((r: any) => r);

  return reserves;
}

async function fetchFees({ fromTimestamp, toTimestamp, createBalances, chain }: FetchOptions) {
  const todaysTimestamp = toTimestamp;
  const yesterdaysTimestamp = fromTimestamp;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const todaysReserves: V3Reserve[] = await fetchReserves(todaysTimestamp, chain);
  const yesterdaysReserves: V3Reserve[] = await fetchReserves(yesterdaysTimestamp, chain);

  for (const reserve of todaysReserves) {
    const yesterdaysReserve = yesterdaysReserves.find(
      (r) => r.reserve.underlyingAsset === reserve.reserve.underlyingAsset
    );

    if (!yesterdaysReserve) {
      continue;
    }

    const tokenAddress = reserve.reserve.underlyingAsset;

    const depositorInterest = parseFloat(reserve.lifetimeDepositorsInterestEarned) - parseFloat(yesterdaysReserve.lifetimeDepositorsInterestEarned);
    const treasuryIncome = parseFloat(reserve.lifetimeReserveFactorAccrued) - parseFloat(yesterdaysReserve.lifetimeReserveFactorAccrued);

    if (depositorInterest < 0 || depositorInterest > 1_000_000 * (10 ** reserve.reserve.decimals)) {
      continue;
    }

    if (treasuryIncome < 0 || treasuryIncome > 1_000_000 * (10 ** reserve.reserve.decimals)) {
      continue;
    }

    if (depositorInterest > 0) {
      dailyFees.addToken(tokenAddress, depositorInterest);
    }
    
    if (treasuryIncome > 0) {
      dailyFees.addToken(tokenAddress, treasuryIncome);
      dailyRevenue.addToken(tokenAddress, treasuryIncome);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchFees,
      start: '2025-02-20'
    },
  },
  version: 2
}

export default adapter;
