import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { FetchOptions } from "../../adapters/types";


const ONE_DAY = 24 * 60 * 60;

const v3Endpoints = {
  [CHAIN.SEI]: "https://api.studio.thegraph.com/query/82370/yei-finance/version/latest",
};

const v3Reserves = async (endpoint: string, timestamp: number) => {
  const graphQuery = `{
    reserves {
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
  const graphRes = await request(endpoint, graphQuery);
  const res = {}
  graphRes.reserves.map((r: any) => {
    if (!r.paramsHistory.length) return;
    const a = r.paramsHistory[0]
    res[a.reserve.underlyingAsset] = a
  });
  return res
};

const fetch = async ({ endTimestamp, chain, createBalances, }: FetchOptions) => {
  const todaysTimestamp = endTimestamp;
  const yesterdaysTimestamp = todaysTimestamp - 60 * 60 * 24;
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()

  const todaysReserves = await v3Reserves(v3Endpoints[chain], todaysTimestamp);
  const yesterdaysReserves = await v3Reserves(v3Endpoints[chain], yesterdaysTimestamp);

  Object.entries(todaysReserves).forEach(([token, reserve]: any) => {
    const yReserve = yesterdaysReserves[token]
    if (!yReserve) return;
    const depositorInterest = +reserve.lifetimeDepositorsInterestEarned - +yReserve.lifetimeDepositorsInterestEarned;
    const treasuryIncome = +reserve.lifetimeReserveFactorAccrued - +yReserve.lifetimeReserveFactorAccrued;
    /*  const flashloanLPPremium = +reserve.lifetimeFlashLoanLPPremium - +yReserve.lifetimeFlashLoanLPPremium;
     const flashloanProtocolPremium = +reserve.lifetimeFlashLoanProtocolPremium - +yReserve.lifetimeFlashLoanProtocolPremium;
     const portalLPFee = +reserve.lifetimePortalLPFee - +yReserve.lifetimePortalLPFee;
     const portalProtocolFee = +reserve.lifetimePortalProtocolFee - +yReserve.lifetimePortalProtocolFee;
     const outstandingTreasuryIncome = +reserve.accruedToTreasury - +yReserve.accruedToTreasury; */

    dailyFees.add(token, depositorInterest);
    dailyFees.add(token, treasuryIncome);
    dailyRevenue.add(token, treasuryIncome);

  })

  return { dailyFees, dailyRevenue };
};

const adapter = {
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: "2025-01-01",
    },
  },
  version: 2,
};

export default adapter;