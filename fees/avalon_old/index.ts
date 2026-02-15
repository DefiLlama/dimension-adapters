import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { Adapter, FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

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
  const dailySupplySideRevenue = createBalances();

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
      dailyFees.addToken(tokenAddress, depositorInterest, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.addToken(tokenAddress, depositorInterest, METRIC.BORROW_INTEREST);
    }

    if (treasuryIncome > 0) {
      dailyFees.addToken(tokenAddress, treasuryIncome, "Reserve factor income");
      dailyRevenue.addToken(tokenAddress, treasuryIncome, "Reserve factor income");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Interest paid by borrowers on outstanding loans",
  Revenue: "Portion of interest income retained by protocol treasury via reserve factor",
  SupplySideRevenue: "Interest income distributed to depositors/lenders who supply capital"
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest paid by borrowers to lenders, accrued daily",
    "Reserve factor income": "Portion of borrow interest allocated to protocol treasury via reserve factor mechanism"
  },
  Revenue: {
    "Reserve factor income": "Protocol treasury income from reserve factor applied to borrow interest"
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Interest income earned by depositors who supply assets to the lending pool"
  }
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: { start: '2024-05-13' },
    [CHAIN.SONIC]: { start: '2024-12-30' }
  },
  fetch: fetchFees,
  methodology,
  breakdownMethodology,
}

export default adapter;
