import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import type { Adapter, FetchOptions } from "../../adapters/types";

const ONE_DAY = 24 * 60 * 60;
const ETHEREUM_ENDPOINT = sdk.graph.modifyEndpoint('EAEyPKcbLHTb9uarfeop5A86n8SUsxmjyvU1ZctsHAZP')
const POOL_ADDRESS = '0x02c3ea4e34c0cbd694d2adfa2c690eecbc1793ee';

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

const fetchReserves = async (timestamp: number): Promise<V3Reserve[]> => {
  const graphQuery = `{
    reserves(where: { pool: "${POOL_ADDRESS}" }) {
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
  
  const graphRes = await request(ETHEREUM_ENDPOINT, graphQuery);
  const reserves = graphRes.reserves.map((r: any) => r.paramsHistory[0]).filter((r: any) => r);

  return reserves;
}

async function fetchFees({ fromTimestamp, toTimestamp }: FetchOptions) {
  const todaysTimestamp = toTimestamp;
  const yesterdaysTimestamp = fromTimestamp

  const todaysReserves: V3Reserve[] = await fetchReserves(todaysTimestamp);
  const yesterdaysReserves: V3Reserve[] = await fetchReserves(yesterdaysTimestamp);

  const feeBreakdown: any = todaysReserves.reduce((acc, reserve: V3Reserve) => {
    const yesterdaysReserve = yesterdaysReserves.find(
      (r: any) => r.reserve.underlyingAsset === reserve.reserve.underlyingAsset
    );

    if (!yesterdaysReserve) {
      return acc;
    }

    const priceInUsd = parseFloat(reserve.priceInUsd) / (10 ** 8);

    const depositorInterest = parseFloat(reserve.lifetimeDepositorsInterestEarned) - parseFloat(yesterdaysReserve?.lifetimeDepositorsInterestEarned);
    const depositorInterestUSD = depositorInterest * priceInUsd / (10 ** reserve.reserve.decimals);

    const flashloanLPPremium = parseFloat(reserve.lifetimeFlashLoanLPPremium) - parseFloat(yesterdaysReserve.lifetimeFlashLoanLPPremium);
    const flashloanLPPremiumUSD = flashloanLPPremium * priceInUsd / (10 ** reserve.reserve.decimals);

    const flashloanProtocolPremium = parseFloat(reserve.lifetimeFlashLoanProtocolPremium) - parseFloat(yesterdaysReserve.lifetimeFlashLoanProtocolPremium);
    const flashloanProtocolPremiumUSD = flashloanProtocolPremium * priceInUsd / (10 ** reserve.reserve.decimals);

    const portalLPFee = parseFloat(reserve.lifetimePortalLPFee) - parseFloat(yesterdaysReserve?.lifetimePortalLPFee);
    const portalLPFeeUSD = portalLPFee * priceInUsd / (10 ** reserve.reserve.decimals);

    const portalProtocolFee = parseFloat(reserve.lifetimePortalProtocolFee) - parseFloat(yesterdaysReserve?.lifetimePortalProtocolFee);
    const portalProtocolFeeUSD = portalProtocolFee * priceInUsd / (10 ** reserve.reserve.decimals);

    const treasuryIncome = parseFloat(reserve.lifetimeReserveFactorAccrued) - parseFloat(yesterdaysReserve?.lifetimeReserveFactorAccrued);
    const outstandingTreasuryIncome = parseFloat(reserve.accruedToTreasury) - parseFloat(yesterdaysReserve?.accruedToTreasury);

    const treasuryIncomeUSD = treasuryIncome * priceInUsd / (10 ** reserve.reserve.decimals);
    const outstandingTreasuryIncomeUSD = outstandingTreasuryIncome * priceInUsd / (10 ** reserve.reserve.decimals);

    if (depositorInterestUSD < 0 || depositorInterestUSD > 1_000_000) {
      return acc;
    }

    if (treasuryIncomeUSD < 0 || treasuryIncomeUSD > 1_000_000) {
      return acc;
    }

    acc.outstandingTreasuryIncomeUSD += outstandingTreasuryIncomeUSD;
    acc.treasuryIncomeUSD += treasuryIncomeUSD;
    acc.depositorInterestUSD += depositorInterestUSD;
    acc.flashloanLPPremiumUSD += flashloanLPPremiumUSD;
    acc.flashloanProtocolPremiumUSD += flashloanProtocolPremiumUSD;
    acc.portalLPFeeUSD += portalLPFeeUSD;
    acc.portalProtocolFeeUSD += portalProtocolFeeUSD;
    return acc;
  }, {
    depositorInterestUSD: 0,
    flashloanLPPremiumUSD: 0,
    flashloanProtocolPremiumUSD: 0,
    portalLPFeeUSD: 0,
    portalProtocolFeeUSD: 0,
    treasuryIncomeUSD: 0,
    outstandingTreasuryIncomeUSD: 0
  });

  const dailyFee = feeBreakdown.depositorInterestUSD + feeBreakdown.treasuryIncomeUSD;
  const dailyRev = feeBreakdown.treasuryIncomeUSD;

  return {
    dailyFees: dailyFee.toString(),
    dailyRevenue: dailyRev.toString(),
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: '2024-07-07'
    }
  },
  version: 2
}

export default adapter;
