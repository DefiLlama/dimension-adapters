import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { Adapter, FetchOptions } from "../../adapters/types";

const ONE_DAY = 24 * 60 * 60;
//solv market only
const ENDPOINTS = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('C2wD3jSTdKsr37b387iWT7LvtdwNYPCi5aqcrzehzUTf'),
  [CHAIN.SONIC]: sdk.graph.modifyEndpoint('EvqZKTT94fEn1XVRsSJAWPzfykFxHhJUhoepCMCsczxZ')
};

const POOL_ADDRESSES = {
  [CHAIN.BSC]: '0x7d51cb25dae8fe4b558dd51282ce67f0cacfe73c',
  [CHAIN.SONIC]: '0x0e2c096de8b15a0a7e9504d49351f54b2f8c314e'
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
    [CHAIN.BSC]: {
      fetch: fetchFees,
      start: '2024-05-13'
    },
    [CHAIN.SONIC]: {
      fetch: fetchFees,
      start: '2024-12-30'
    }
  },
  version: 2
}

export default adapter;
